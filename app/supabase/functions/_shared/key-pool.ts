export type KeySlot = "primary" | "secondary" | "tertiary";
export type FailoverMode = "shared" | "emergency-only";
export type ProviderName = "gemini" | "nvidia_nim";

export type AiProviderErrorCode =
  | "rate_limited"
  | "unauthorized"
  | "provider_unavailable"
  | "timeout"
  | "malformed_response"
  | "not_configured";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly retryAfterSeconds: number;
  /**
   * Optional short diagnostic (HTTP status + a body snippet, never the API
   * key itself) for error codes -- like "provider_unavailable" -- that
   * otherwise collapse many distinct upstream failures (400 bad request,
   * DNS failure, connection reset, 5xx) into one opaque string. Purely
   * informational: `code` alone still drives all retry/failover branching
   * in withKeyFailover, so adding this cannot change control flow. The
   * caller (engine-worker) persists this into check_jobs.last_error_code
   * instead of the bare code when present, so a stuck "provider_unavailable"
   * job is diagnosable from the DB without needing edge function logs.
   * Added 2026-09-01 while investigating a 100%-failure-rate NVIDIA NIM
   * grounded_search test that gave no other clue why it was failing.
   */
  readonly detail?: string;

  // Plain constructor body, not TS parameter-property shorthand: Node's
  // built-in test runner (this project's chosen tool, see Module 0.0's
  // decisions log on why Vitest was dropped) strips TypeScript syntax
  // without full type-aware transformation, and parameter properties need
  // real code generation (an implicit `this.x = x`), not just annotation
  // stripping. This file itself runs under Deno (not Node's test runner),
  // but its byte-for-byte twin in src/lib/ai-providers/key-pool.ts does --
  // keep both plain so the app-side copy stays test-runnable.
  constructor(code: AiProviderErrorCode, retryAfterSeconds = 60, detail?: string) {
    super(code);
    this.name = "AiProviderError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.detail = detail;
  }
}

type KeyCandidate = { slot: KeySlot; key: string };
// In-process-only memory of keys marked dead *this invocation*. This alone
// is not durable across cold starts -- ai_provider_key_health (Postgres) is
// the durable record, written via onKeyDead and an admin's "clear dead flag"
// action (5.10). Callers that have already fetched the DB's dead-key set
// (see engine-worker/index.ts's getKeyHealth()) must pass it in via
// `knownDeadSlots` below, or a key marked dead in a previous invocation will
// be retried on every fresh cold start -- this was a real bug found during
// Module 5.3's review (2026-07-24): the DB read existed but its result was
// never threaded into key selection.
const deadKeys = new Set<string>();

function candidates(provider: ProviderName, knownDeadSlots?: ReadonlySet<KeySlot>): KeyCandidate[] {
  const prefix = provider === "gemini" ? "GEMINI_API_KEY" : "NVIDIA_NIM_API_KEY";
  return (["primary", "secondary", "tertiary"] as const)
    .map((slot) => ({ slot, key: Deno.env.get(`${prefix}_${slot.toUpperCase()}`)?.trim() ?? "" }))
    .filter(
      (candidate) =>
        candidate.key.length > 0 &&
        !deadKeys.has(`${provider}:${candidate.slot}`) &&
        !(knownDeadSlots?.has(candidate.slot) ?? false),
    );
}

// NOTE: this file is duplicated (not shared) at
// src/lib/ai-providers/key-pool.ts, because Deno Edge Functions and the
// Next.js app cannot import each other's modules -- different runtimes,
// different module resolution. This is the copy that actually runs in
// production (the worker is entirely an edge function); the app-side twin
// exists purely for Node-test-runner coverage of the same logic. Keep the
// *logic* (types, error codes, failover branching, key selection) identical
// between the two copies -- only environment glue (Deno.env.get vs
// process.env, import "server-only", esm.sh vs npm imports) should differ.
// A logic drift between the two (this review caught onKeyDead taking 2 args
// in the app-side copy vs 3 here, and zod validation present in the app-side
// gemini-provider.ts but missing here before this fix) is a real,
// already-happened failure mode -- if you change the logic in one, change
// it in both, same commit.
export async function withKeyFailover<T>(options: {
  provider: ProviderName;
  mode: FailoverMode;
  /** Dead-key slots already known from ai_provider_key_health (DB), so a cold start doesn't retry a key an admin/previous invocation already marked dead. */
  knownDeadSlots?: ReadonlySet<KeySlot>;
  run: (key: string, slot: KeySlot) => Promise<T>;
  onKeyDead?: (provider: ProviderName, slot: KeySlot, code: string) => Promise<void>;
  /** Called synchronously at the start of each candidate attempt, before calling options.run. */
  onAttempt?: (slot: KeySlot) => void;
}): Promise<T> {
  const keys = candidates(options.provider, options.knownDeadSlots);
  if (!keys.length) throw new AiProviderError("not_configured");
  let lastError: AiProviderError | undefined;
  for (const candidate of keys) {
    options.onAttempt?.(candidate.slot);
    try {
      return await options.run(candidate.key, candidate.slot);
    } catch (error) {
      const typed =
        error instanceof AiProviderError ? error : new AiProviderError("provider_unavailable");
      lastError = typed;
      const hardFailure =
        typed.code === "unauthorized" ||
        typed.code === "provider_unavailable" ||
        typed.code === "timeout";
      if (typed.code === "unauthorized") {
        deadKeys.add(`${options.provider}:${candidate.slot}`);
        await options.onKeyDead?.(options.provider, candidate.slot, typed.code);
      }
      if (typed.code === "rate_limited" && options.mode === "emergency-only") break;
      if (!hardFailure && typed.code !== "rate_limited") break;
    }
  }
  throw lastError ?? new AiProviderError("provider_unavailable");
}

export function resetKeyPoolForTests() {
  deadKeys.clear();
}
