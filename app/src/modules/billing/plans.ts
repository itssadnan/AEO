/**
 * Module 5.9 — Billing & Subscription: plan catalog.
 *
 * Single source of truth for what each plan tier costs and includes.
 * Deliberately zero runtime dependencies (no Supabase client, no Next.js
 * APIs, no `server-only`) so it can be unit tested in a plain Node process
 * and safely imported from client components for display purposes — same
 * pattern as modules/dashboard/plan-tier.ts.
 *
 * Numbers below are grounded in two places, not invented here:
 *   - promptLimit/brandLimit/checkFrequency mirror the *already-applied*
 *     database enforcement: migration 0005 (private.enforce_prompt_plan_rules,
 *     Starter 25 / Growth 75 / Agency 200) and migration 0023
 *     (private.enforce_brand_plan_rules, Starter 1 / Growth 3 / Agency 50
 *     fair-use) and migration 0007 (enqueue_due_paid_checks, Starter weekly /
 *     Growth+Agency daily). This file must stay in sync with those triggers
 *     by hand — there is no single source both a Postgres CHECK/trigger and
 *     a TypeScript object can share directly in this stack.
 *   - priceUsdDisplay is the *top* of each range in spec Section 3.4's
 *     pricing table ($39–49 / $99–149 / $249–349), matching the same
 *     "pick the top of the stated range" precedent already used for the
 *     prompt limits above (25 of 15–25, 75 of 50–75).
 *
 * Currency decision: Razorpay's account for this project will be an
 * India-registered business (see this module's decisions log — the reason
 * Stripe was rejected in the first place is that Stripe requires invite-only
 * approval for India-registered businesses; Razorpay's default settlement
 * currency is INR, and accepting USD/international cards requires a
 * separate "International Payments" activation step in the Razorpay
 * dashboard that is not guaranteed to be approved instantly). Real Plans are
 * created in the Razorpay dashboard once the account exists (see this
 * module's Blockers) — priceInrPaise here is a placeholder for local
 * dev/type-safety only, using a round ~83 INR/USD conversion of the USD
 * display price. The actual charged amount is whatever the real Razorpay
 * Plan is configured with when the user creates it; reconcile this constant
 * with the real dashboard-set value once that happens.
 */

export type PlanTierId = "free" | "starter" | "growth" | "agency";
export type PaidPlanTierId = Exclude<PlanTierId, "free">;

export interface PlanDefinition {
  id: PlanTierId;
  name: string;
  priceUsdDisplay: string;
  priceInrPaise: number;
  promptLimit: number;
  brandLimit: number;
  checkFrequency: "on-demand" | "weekly" | "daily";
  /** Env var name holding the real Razorpay Plan id for this tier. Null for `free` (no Razorpay plan exists for it). */
  razorpayPlanIdEnvVar: string | null;
}

export const PLAN_CATALOG: Record<PlanTierId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceUsdDisplay: "$0",
    priceInrPaise: 0,
    // Not a period limit -- see Module 5.9 decisions log, 2026-07-23 entry:
    // Free is 3 lifetime on-demand experiments (workspaces.experiments_used),
    // fixed at 5 non-editable prompts and 1 brand, not a recurring quota.
    promptLimit: 5,
    brandLimit: 1,
    checkFrequency: "on-demand",
    razorpayPlanIdEnvVar: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceUsdDisplay: "$49/mo",
    priceInrPaise: 410000, // ~83 INR/USD * 49, rounded -- placeholder, see file header
    promptLimit: 25,
    brandLimit: 1,
    checkFrequency: "weekly",
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_ID_STARTER",
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceUsdDisplay: "$149/mo",
    priceInrPaise: 1250000, // ~83 INR/USD * 149, rounded -- placeholder, see file header
    promptLimit: 75,
    brandLimit: 3,
    checkFrequency: "daily",
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_ID_GROWTH",
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceUsdDisplay: "$349/mo",
    priceInrPaise: 2900000, // ~83 INR/USD * 349, rounded -- placeholder, see file header
    promptLimit: 200,
    brandLimit: 50, // fair-use soft cap, not a literal "unlimited" -- matches migration 0023's comment
    checkFrequency: "daily",
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_ID_AGENCY",
  },
};

export const PAID_PLAN_TIER_IDS: PaidPlanTierId[] = ["starter", "growth", "agency"];

export function isPaidPlanTier(tier: string): tier is PaidPlanTierId {
  return tier === "starter" || tier === "growth" || tier === "agency";
}

/**
 * Reads the real Razorpay Plan id for a paid tier from its env var. Returns
 * null (not a throw) when unset, so callers can distinguish "Razorpay not
 * configured yet" from a programming error and surface a clean message
 * instead of crashing -- same pattern as RESEND_API_KEY in Module 5.8.
 */
export function getRazorpayPlanId(tier: PaidPlanTierId): string | null {
  const envVar = PLAN_CATALOG[tier].razorpayPlanIdEnvVar;
  if (!envVar) return null;
  return process.env[envVar] || null;
}
