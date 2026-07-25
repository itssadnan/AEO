/**
 * Token-bucket rate limiter for Gemini free-tier RPM/RPD caps, tracked
 * per key slot (primary/secondary/tertiary), not as one shared bucket.
 *
 * Each Gemini API key is its own Google account with its own independent
 * free-tier quota (15 RPM / 1500 RPD per docs/CONVENTIONS.md Section 5's
 * multi-key pool). An earlier version of this file used a single shared
 * bucket across all three keys -- that capped total throughput at what one
 * key alone gets, defeating the entire point of the multi-key pool (found
 * during Module 5.3's review, 2026-07-24). Each slot now gets its own
 * independent bucket, so 3 live keys genuinely give ~3x the throughput.
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
const RPD_CAP = 1500;
const RPM_REFILL_RATE = RPM_CAP / 60; // 0.25 tokens per second

function freshState(now: number): RateLimitState {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  return { rpmTokens: RPM_CAP, rpdTokens: RPD_CAP, lastRefill: now, dayStart: dayStart.getTime() };
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

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  if (dayStart.getTime() > state.dayStart) {
    state.rpdTokens = RPD_CAP;
    state.dayStart = dayStart.getTime();
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
