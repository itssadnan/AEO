// Supabase Edge Function  Module 5.3 queue worker.
// Deploy with: supabase functions deploy engine-worker --no-verify-jwt
// The endpoint is protected by ENGINE_WORKER_SECRET (kept in Vault and
// sent only by the pg_cron/pg_net invocation), not by a browser session.

import type { FailoverMode, KeySlot, ProviderName } from "../_shared/key-pool.ts";
import { resolveTaskModel } from "../_shared/task-model.ts";
import { runGeminiGroundedPrompt } from "../_shared/gemini-provider.ts";
import { runNvidiaNimPrompt } from "../_shared/nvidia-nim-provider.ts";
import { getGeminiRateLimitStatus } from "../_shared/rate-limiter.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("ENGINE_WORKER_SECRET")!;

// Staggering configuration
const STAGGER_BASE_MS = 200; // base delay between jobs
const STAGGER_JITTER_MS = 100; // random jitter to avoid thundering herd

// A job claimed by a worker that then crashes or hits the Edge Function's
// execution timeout would otherwise sit in 'processing' forever -- nothing
// else ever revisits it. reclaim_stale_check_jobs() (migration 0009) resets
// anything still 'processing' after this long back to 'retry'/'failed'.
// Kept comfortably above this worker's realistic per-batch runtime (10 jobs
// x up to 45s provider timeout each, worst case) so a genuinely in-flight
// job is never reclaimed out from under itself.
const STALE_JOB_MINUTES = 5;

type Job = {
  job_id: string;
  workspace_id: string;
  brand_id: string;
  prompt_id: string;
  prompt_text: string;
};

function headers() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${name} failed: ${response.status}`);
  // PostgREST returns 204 No Content (empty body) for `returns void` functions
  // (retry_or_fail_check_job, complete_check_job) unless a `Prefer:
  // return=representation` header is sent, which this helper doesn't send.
  // `.json()` on an empty body throws "Unexpected end of JSON input" --
  // found live during the 5.3 smoke test (2026-07-25): the per-job
  // try/catch in processJobWithStagger correctly caught the provider
  // failure and called retry_or_fail_check_job, which updated the DB row
  // correctly, but then THIS bug threw while parsing that void RPC's empty
  // response, escaping the per-job catch entirely and turning a handled
  // failure into an unhandled 500 for the whole invocation.
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function select<T>(path: string): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!response.ok) throw new Error(`select failed: ${response.status}`);
  return (await response.json()) as T;
}

// Structured logging helper
function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    worker: "engine-worker",
    ...meta,
  };
  console[level](JSON.stringify(entry));
}

async function getFailoverMode(provider: "gemini" | "nvidia_nim"): Promise<FailoverMode> {
  const rows = await select<Array<{ failover_mode: FailoverMode }>>(
    `ai_provider_settings?provider=eq.${provider}&select=failover_mode`,
  );
  return rows[0]?.failover_mode ?? "shared";
}

async function getKeyHealth(provider: "gemini" | "nvidia_nim"): Promise<Set<KeySlot>> {
  const health = await select<Array<{ key_slot: KeySlot; is_dead: boolean }>>(
    `ai_provider_key_health?provider=eq.${provider}&select=key_slot,is_dead`,
  );
  return new Set(health.filter((row) => row.is_dead).map((row) => row.key_slot));
}

const ADMIN_ALERT_WEBHOOK_URL = Deno.env.get("ADMIN_ALERT_WEBHOOK_URL");

async function markKeyDead(provider: ProviderName, slot: KeySlot, code: string): Promise<void> {
  await rpc("mark_ai_key_dead", { p_provider: provider, p_key_slot: slot, p_error_code: code });
  log("warn", "API key marked dead", { provider, slot, code });

  if (ADMIN_ALERT_WEBHOOK_URL) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch(ADMIN_ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `AI provider key dead: ${provider} ${slot} (${code})` }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (err) {
      log("error", "Failed to send dead key webhook alert", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function runProviderCall(options: {
  provider: "gemini" | "nvidia_nim";
  prompt: string;
  model: string;
  failoverMode: FailoverMode;
  onAttempt?: (slot: KeySlot) => void;
}): Promise<{
  text: string;
  citations: unknown[];
  groundingMetadata: Record<string, unknown>;
  keySlot: KeySlot | undefined;
}> {
  // Read the durably-persisted dead-key set from Postgres and thread it
  // into key selection. A prior version fetched this and then never used
  // it -- withKeyFailover kept its own disconnected in-memory set, so a
  // key marked dead in an earlier invocation got retried on every cold
  // start. Found during Module 5.3's review, 2026-07-24.
  const knownDeadSlots = await getKeyHealth(options.provider);
  const mode = options.failoverMode;

  // Capture which key slot was actually used for this successful/failed attempt
  let lastAttemptedSlot: KeySlot | undefined;

  if (options.provider === "gemini") {
    const result = await runGeminiGroundedPrompt({
      prompt: options.prompt,
      model: options.model,
      failoverMode: mode,
      knownDeadSlots,
      onKeyDead: markKeyDead,
      onAttempt: (slot) => {
        lastAttemptedSlot = slot;
        options.onAttempt?.(slot);
      },
      fetchImpl: fetch,
    });
    return {
      text: result.text,
      citations: result.citations,
      groundingMetadata: result.groundingMetadata,
      keySlot: lastAttemptedSlot,
    };
  } else {
    const text = await runNvidiaNimPrompt({
      prompt: options.prompt,
      model: options.model,
      failoverMode: mode,
      knownDeadSlots,
      onKeyDead: markKeyDead,
      onAttempt: (slot) => {
        lastAttemptedSlot = slot;
        options.onAttempt?.(slot);
      },
      fetchImpl: fetch,
    });
    return { text, citations: [], groundingMetadata: {}, keySlot: lastAttemptedSlot };
  }
}

// Stagger job processing to respect rate limits
async function processJobWithStagger(job: Job, index: number): Promise<void> {
  // Add stagger delay based on job index
  const staggerDelay = STAGGER_BASE_MS * index + Math.random() * STAGGER_JITTER_MS;
  if (staggerDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, staggerDelay));
  }

  // Hoisted so the catch block below can log/report which provider this
  // job was actually attempted against -- see the migration 0009 comment
  // on why retry_or_fail_check_job needs the real provider, not a
  // hardcoded guess.
  let provider: "gemini" | "nvidia_nim" = "gemini";

  // Hoisted so the catch block can pass the last attempted key slot to
  // retry_or_fail_check_job (p_key_slot). If no attempt was made at all
  // before failing (e.g. not_configured -- every key missing), this stays
  // undefined and we pass null to the RPC.
  let lastAttemptedSlot: KeySlot | undefined;

  try {
    // Resolve provider + model for this workspace/task
    const task = await resolveTaskModel("grounded_search", job.workspace_id);
    provider = task.provider;

    if (task.provider === "gemini") {
      const status = getGeminiRateLimitStatus("primary");
      log("info", "Gemini rate limit status (primary slot)", {
        jobId: job.job_id,
        rpmRemaining: status.rpmRemaining,
        rpdRemaining: status.rpdRemaining,
      });
    }

    // Execute the grounded search call
    const result = await runProviderCall({
      provider: task.provider,
      prompt: job.prompt_text,
      model: task.model,
      failoverMode: await getFailoverMode(task.provider),
      onAttempt: (slot) => {
        lastAttemptedSlot = slot;
      },
    });

    // Record successful result
    await rpc("complete_check_job", {
      p_job_id: job.job_id,
      p_provider: task.provider,
      p_model: task.model,
      p_raw_answer: result.text,
      p_citations: result.citations,
      p_grounding_metadata: result.groundingMetadata,
      p_key_slot: result.keySlot ?? null,
    });

    log("info", "Job completed successfully", {
      jobId: job.job_id,
      provider: task.provider,
      keySlot: result.keySlot,
    });
  } catch (error) {
    const typed = error as { code?: string; retryAfterSeconds?: number; detail?: string };
    // Prefer the richer diagnostic (real HTTP status + body snippet, or the
    // underlying fetch exception) when the provider attached one -- see
    // key-pool.ts's AiProviderError.detail doc-comment. Falls back to the
    // bare code for every error path that doesn't set detail (rate_limited,
    // unauthorized, not_configured, etc.), so this is additive only.
    const errorCode = typed.detail ?? typed.code ?? "worker_error";
    const retryAfter = typed.retryAfterSeconds ?? 120;

    await rpc("retry_or_fail_check_job", {
      p_job_id: job.job_id,
      p_error_code: errorCode,
      p_retry_after_seconds: retryAfter,
      p_provider: provider,
      p_key_slot: lastAttemptedSlot ?? null,
    });

    log("error", "Job failed", {
      jobId: job.job_id,
      provider,
      errorCode,
      retryAfter,
      keySlot: lastAttemptedSlot,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Constant-time comparison so the worker secret can't be brute-forced via
 * response-timing differences. Plain `!==` leaks how many leading
 * characters matched through timing; not the highest-value attack surface
 * here (this is an internal cron secret, not a public-facing signature),
 * but this project's own stated security baseline calls for constant-time
 * secret comparison (see 5.9's webhook-signature note), so the worker
 * secret check should hold to the same standard. Found during Module 5.3's
 * review, 2026-07-24.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  // A length mismatch is itself detectable (a fixed-length HMAC comparison
  // would be needed to hide even that), but still walk a same-length dummy
  // loop so this branch doesn't return measurably faster than the
  // equal-length path below -- good enough for an internal cron secret,
  // where the realistic attack surface is far smaller than a public
  // signature check.
  if (bytesA.length !== bytesB.length) {
    let dummy = 0;
    for (let i = 0; i < bytesA.length; i++) dummy |= bytesA[i] ^ 0;
    void dummy;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

Deno.serve(async (request) => {
  const providedSecret = request.headers.get("x-engine-worker-secret") ?? "";
  if (
    request.method !== "POST" ||
    !WORKER_SECRET ||
    !timingSafeEqual(providedSecret, WORKER_SECRET)
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  log("info", "Worker invocation started", { requestId });

  try {
    // Recover anything a crashed/timed-out prior invocation left stuck in
    // 'processing' before claiming new work.
    const reclaimed = await rpc<number>("reclaim_stale_check_jobs", {
      p_stale_after_minutes: STALE_JOB_MINUTES,
    });
    if (reclaimed > 0) log("warn", "Reclaimed stale jobs", { requestId, reclaimed });

    // Enqueue due paid checks (staggered by migration logic)
    await rpc<number>("enqueue_due_paid_checks", { p_limit: 100 });

    // Claim up to 10 jobs for processing
    const jobs = await rpc<Job[]>("claim_check_jobs", { p_limit: 10 });

    log("info", "Jobs claimed", { requestId, count: jobs.length });

    // Process jobs with staggering
    for (let i = 0; i < jobs.length; i++) {
      await processJobWithStagger(jobs[i], i);
    }

    const durationMs = Date.now() - startTime;
    log("info", "Worker invocation completed", { requestId, processed: jobs.length, durationMs });

    return Response.json({ processed: jobs.length, reclaimed });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log("error", "Worker invocation failed", {
      requestId,
      durationMs,
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "worker failure" }, { status: 500 });
  }
});
