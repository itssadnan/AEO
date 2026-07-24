import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Sliding-window IP rate limiter backed by the rate_limit_events table
 * (Postgres-based, per docs/CONVENTIONS.md Section 4 — no Redis at this
 * scale). Shared by Module 5.1 (signup) and Module 5.11 (public free-check,
 * built later) — implemented once here so 5.11 reuses it instead of
 * duplicating the pattern.
 *
 * Must be called with a service-role client: rate_limit_events has RLS
 * enabled with no policies, so anon/authenticated roles get zero access.
 */
export async function checkRateLimit(
  supabase: SupabaseClient<Database>,
  params: { key: string; maxAttempts: number; windowMs: number },
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Date.now() - params.windowMs).toISOString();

  const { count, error } = await supabase
    .from("rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("rate_key", params.key)
    .gte("created_at", windowStart);

  if (error) {
    // Fail open on infra error rather than locking out every user because the
    // rate-limit table itself is temporarily unreachable. Logged, not
    // silently swallowed — see docs/CONVENTIONS.md Section 6 on error
    // handling.
    console.error("checkRateLimit: query failed, failing open", error);
    return { allowed: true, remaining: params.maxAttempts };
  }

  const used = count ?? 0;
  if (used >= params.maxAttempts) {
    return { allowed: false, remaining: 0 };
  }

  const { error: insertError } = await supabase
    .from("rate_limit_events")
    .insert({ rate_key: params.key });

  if (insertError) {
    console.error("checkRateLimit: failed to record attempt", insertError);
  }

  return { allowed: true, remaining: params.maxAttempts - used - 1 };
}
