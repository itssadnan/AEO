// Supabase Edge Function — Module 5.4 extraction worker.
// Deploy with: supabase functions deploy extraction-worker --no-verify-jwt
// The endpoint is protected by EXTRACTION_WORKER_SECRET (kept in Vault and
// sent only by the pg_cron/pg_net invocation), not by a browser session.

import type { FailoverMode, KeySlot, ProviderName } from "../_shared/key-pool.ts";
import { resolveTaskModel } from "../_shared/task-model.ts";
import { runNvidiaNimPrompt } from "../_shared/nvidia-nim-provider.ts";
import {
  buildExtractionPrompt,
  parseExtractionResponse,
  type ExtractionResult,
} from "../_shared/nlp-extraction.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("EXTRACTION_WORKER_SECRET")!;

// Staggering configuration
const STAGGER_BASE_MS = 200; // base delay between jobs
const STAGGER_JITTER_MS = 100; // random jitter to avoid thundering herd

// A job claimed by a worker that then crashes or hits the Edge Function's
// execution timeout would otherwise sit in 'processing' forever -- nothing
// else ever revisits it. reclaim_stale_extractions() (migration 0013) resets
// anything still 'processing' after this long back to 'retry'/'failed'.
// Kept comfortably above this worker's realistic per-batch runtime (10 jobs
// x up to 45s provider timeout each, worst case) so a genuinely in-flight
// job is never reclaimed out from under itself.
const STALE_JOB_MINUTES = 5;

type Job = {
  extraction_id: string;
  check_run_id: string;
  workspace_id: string;
  brand_id: string;
  prompt_id: string;
  raw_answer: string;
  citations: unknown;
  brand_name: string;
  competitor_names: string[];
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
  // (retry_or_fail_extraction, complete_extraction) unless a `Prefer:
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
    worker: "extraction-worker",
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

async function markKeyDead(provider: ProviderName, slot: KeySlot, code: string): Promise<void> {
  await rpc("mark_ai_key_dead", { p_provider: provider, p_key_slot: slot, p_error_code: code });
  log("warn", "API key marked dead", { provider, slot, code });
}

// Stagger job processing to respect rate limits
async function processJobWithStagger(job: Job, index: number): Promise<void> {
  // Add stagger delay based on job index
  const staggerDelay = STAGGER_BASE_MS * index + Math.random() * STAGGER_JITTER_MS;
  if (staggerDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, staggerDelay));
  }

  try {
    // Resolve provider + model for this workspace/task
    const task = await resolveTaskModel("extraction", job.workspace_id);

    if (task.provider !== "nvidia_nim") {
      throw new Error(
        `extraction task resolved to unsupported provider '${task.provider}' -- only nvidia_nim is implemented`,
      );
    }

    // Fetch dead-key set and failover mode
    const knownDeadSlots = await getKeyHealth("nvidia_nim");
    const failoverMode = await getFailoverMode("nvidia_nim");

    // Build the extraction prompt
    const prompt = buildExtractionPrompt({
      rawAnswer: job.raw_answer,
      brandName: job.brand_name,
      competitorNames: job.competitor_names,
      citations: job.citations as { uri: string; title?: string }[],
    });

    // Call NVIDIA NIM
    const rawText = await runNvidiaNimPrompt({
      prompt,
      model: task.model,
      failoverMode,
      knownDeadSlots,
      onKeyDead: markKeyDead,
      fetchImpl: fetch,
    });

    // Parse and validate the extraction response
    const result: ExtractionResult = parseExtractionResponse(rawText, job.raw_answer);

    // Record successful result
    await rpc("complete_extraction", {
      p_extraction_id: job.extraction_id,
      p_provider: task.provider,
      p_model: task.model,
      p_brand_mentioned: result.brand_mentioned,
      p_position_among_competitors: result.position_among_competitors,
      p_reasoning: result.reasoning,
      p_sentiment: result.sentiment,
      p_competitor_names_found: result.competitor_names_found,
      p_cited_domains: result.cited_domains,
      p_cited_domain_types: result.cited_domain_types,
    });

    log("info", "Extraction job completed successfully", {
      extractionId: job.extraction_id,
      provider: task.provider,
    });
  } catch (error) {
    const typed = error as { code?: string; retryAfterSeconds?: number };
    const errorCode = typed.code ?? "worker_error";
    const retryAfter = typed.retryAfterSeconds ?? 120;

    await rpc("retry_or_fail_extraction", {
      p_extraction_id: job.extraction_id,
      p_error_code: errorCode,
    });

    log("error", "Extraction job failed", {
      extractionId: job.extraction_id,
      errorCode,
      retryAfter,
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
  const providedSecret = request.headers.get("x-extraction-worker-secret") ?? "";
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
    const reclaimed = await rpc<number>("reclaim_stale_extractions", {
      p_stale_after_minutes: STALE_JOB_MINUTES,
    });
    if (reclaimed > 0) log("warn", "Reclaimed stale extractions", { requestId, reclaimed });

    // Claim up to 10 jobs for processing
    const jobs = await rpc<Job[]>("claim_extraction_jobs", { p_limit: 10 });

    log("info", "Extraction jobs claimed", { requestId, count: jobs.length });

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
