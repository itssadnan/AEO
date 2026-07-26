/**
 * Plan-tier mapping — Module 5.6.
 *
 * Deliberately kept in its own file with zero runtime dependencies (no
 * Supabase client, no Next.js APIs) so it can be unit tested in a plain
 * Node process without dragging in server-only/next-runtime imports —
 * see tests/unit/dashboard.test.ts.
 */

import type { PlanTier } from "./types";

/**
 * Maps a workspace's raw `plan_tier` DB value to the dashboard's PlanTier type.
 *
 * The real DB constraint (migration 0001) is
 * `plan_tier in ('free', 'starter', 'growth', 'agency')`, so those four values
 * pass through unchanged. `pro`/`enterprise` are kept as legacy aliases only
 * for defensive compatibility with any pre-migration data; they are not real
 * current values. Anything else falls back to `free`, matching the DB
 * column's own default.
 *
 * This used to be copy-pasted inline in every dashboard route file, each
 * missing explicit `starter`/`growth` cases and silently collapsing both
 * real, valid plan tiers to `free` — a real plan-gating bug found during
 * independent verification of Module 5.6 (see
 * progress/modules/5.6-dashboard-frontend.md decisions log, 2026-07-26).
 * Centralized here so it has exactly one implementation and one test, per
 * this module's own "don't duplicate a shared utility" lesson.
 */
export function mapPlanTier(tier: string): PlanTier {
  switch (tier) {
    case "free":
      return "free";
    case "starter":
      return "starter";
    case "growth":
      return "growth";
    case "agency":
      return "agency";
    // Legacy aliases, kept for backward compatibility with any pre-migration data.
    case "pro":
      return "starter";
    case "enterprise":
      return "agency";
    default:
      return "free";
  }
}
