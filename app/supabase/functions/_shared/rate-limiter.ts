/**
 * Token-bucket rate limiter for Gemini free-tier RPM/RPD caps, tracked
 * per key slot (primary/secondary/tertiary), not as one shared bucket.
 *
 * Each Gemini API key is its own Google Cloud project with its own
 * independent free-tier quota. Values below (15 RPM / 500 RPD) are the
 * REAL numbers confirmed live against the actual production project
 * (TruSight, gen-lang-client-0568762060) for gemini-3.5-flash-lite via a
 * direct diagnostic call to the Gemini REST API on 2026-07-29 -- the
 * previous 1500 RPD figure here was never real for this project (Google
 * does not publish a static free-tier table; the only authoritative
 * source is the live per-project AI Studio Rate Limit dashboard). That
 * wrong 1500 assumption let the worker believe it had ~75x its real
 * daily budget, so it never throttled itself and hammered an exhausted
 * quota every 5 minutes for 4 days straight (see Module 5.3's decisions
 * log, 2026-07-29 entries, for the full investigation).
 *
 * IMPORTANT CAVEAT this limiter still cannot fully protect against:
 * Google Search grounding (the tool this worker's grounded_search calls
 * always use) has its OWN separate, lower, and undisclosed daily quota,
 * confirmed live the same day -- a grounded call can get a real 429 from
 * Google even while the base model's 500 RPD is completely unused. There
 * is no published number for the real grounding cap, so this file can
 * only bound the base-model RPM/RPD; the caller (gemini-provider.ts)
 * backs off more conservatively on grounding-specific 429s for that
 * reason. Update RPD_CAP again if/when a genuinely reliable number is
 * confirmed (e.g. after billing is enabled and Google documents it).
 *
 * An earlier version of this file used a single shared bucket across all
 * three keys -- that capped total throughput at what one key alone gets,
 * defeating the entire point of the multi-key pool (found during Module
 * 5.3's review, 2026-07-24). Each slot now gets its own independent
 * bucket, so multiple live keys from separate projects genuinely add up.
 */
import type { KeySlot } from "./key-pool.ts";
import { AiProviderError } from "./key-pool.ts";

interface RateLimitState {
  rpmTokens: number;
  rpdTokens: number;
  lastRefill: number;
  dayStart: number;
}

const RPM_CAP = 15;
const RPD_CAP = 500;
const RPM_REFILL_RATE = RPM_CAP / 60; // 0.25 tokens per second

// Google's RPD quotas reset at midnight Pacific time, not local/UTC
// midnight (see https://ai.google.dev/gemini-api/docs/rate-limits:
// "Requests per day (RPD) quotas reset at midnight Pacific time"). Using
// server-local midnight (this Edge Function's Deno runtime defaults to
// UTC) would reset our own bucket up to 7-8 hours off from Google's real
// reset, over- or under-estimating remaining daily budget for that
// window. Found while fixing the RPD_CAP value above, 2026-07-29.
function pacificMidnightBoundary(now: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  // Midnight Pacific on this calendar date, expressed as a UTC instant.
  // Construct via a round-trip: interpret "Y-M-D 00:00" as if it were UTC,
  // then correct by the Pacific offset at that instant.
  const naiveUtcGuess = Date.parse(`${y}-${m}-${d}T00:00:00Z`);
  const offsetMs = getPacificOffsetMs(naiveUtcGuess);
  return naiveUtcGuess - offsetMs;
}

function getPacificOffsetMs(atUtcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(atUtcMs));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")) % 24,
    Number(get("minute")),
    Number(get("second")),
  );
  return asUtc - atUtcMs;
}

function freshState(now: number): RateLimitState {
  return { rpmTokens: RPM_CAP, rpdTokens: RPD_CAP, lastRefill: now, dayStart: pacificMidnightBoundary(now) };
}

const states = new Map<KeySlot, RateLimitState>();

function getState(slot: KeySlot): RateLimitState {
  let state = states.get(slot);
  if (!state) {
    state = freshState(Date.now());
    states.set(slot, state);
  }
  return state;
}

function refill(state: RateLimitState): void {
  const now = Date.now();
  const elapsedSeconds = (now - state.lastRefill) / 1000;
  state.rpmTokens = Math.min(RPM_CAP, state.rpmTokens + elapsedSeconds * RPM_REFILL_RATE);

  const currentBoundary = pacificMidnightBoundary(now);
  if (currentBoundary > state.dayStart) {
    state.rpdTokens = RPD_CAP;
    state.dayStart = currentBoundary;
  }
  state.lastRefill = now;
}

/**
 * Blocks briefly (at most a few seconds) to smooth out RPM bursts. If the
 * *daily* cap for this key is exhausted, this throws a retryable
 * AiProviderError instead of sleeping -- an earlier version slept for 24
 * hours in-process, which an Edge Function's execution timeout would just
 * kill mid-sleep rather than actually wait out (found during Module 5.3's
 * review, 2026-07-24). Callers get a normal rate_limited error and the job
 * gets requeued through the standard retry path instead.
 */
export async function acquireGeminiToken(slot: KeySlot): Promise<void> {
  const state = getState(slot);
  refill(state);

  if (state.rpdTokens < 1) {
    const msUntilMidnight = state.dayStart + 24 * 60 * 60 * 1000 - Date.now();
    throw new AiProviderError("rate_limited", Math.ceil(Math.max(msUntilMidnight, 60_000) / 1000));
  }

  if (state.rpmTokens >= 1) {
    state.rpmTokens -= 1;
    state.rpdTokens -= 1;
    return;
  }

  const rpmWaitMs = ((1 - state.rpmTokens) / RPM_REFILL_RATE) * 1000;
  await new Promise((resolve) => setTimeout(resolve, Math.max(rpmWaitMs, 100)));
  return acquireGeminiToken(slot);
}

export function getGeminiRateLimitStatus(slot: KeySlot): {
  rpmRemaining: number;
  rpdRemaining: number;
} {
  const state = getState(slot);
  refill(state);
  return { rpmRemaining: Math.floor(state.rpmTokens), rpdRemaining: Math.floor(state.rpdTokens) };
}

export function resetRateLimiterForTests(): void {
  states.clear();
}
