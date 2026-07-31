"use server";

import { createSupabaseServerClient } from "@/lib/db";
import {
  createRazorpaySubscription,
  cancelRazorpaySubscription,
  updateRazorpaySubscription,
  isRazorpayConfigured,
} from "./razorpay-client";
import { PLAN_CATALOG, getRazorpayPlanId, isPaidPlanTier, type PaidPlanTierId } from "./plans";

/**
 * Confirms the caller is signed in AND is the `owner` of `workspaceId`
 * before letting a billing action proceed. Mirrors the DB-level check
 * already inside create_pending_subscription (migration 0023) --
 * deliberately re-checked here too, defense in depth, so an unauthorized
 * caller gets a clean `{ error }` from the Server Action instead of a raw
 * Postgres FORBIDDEN/42501 error string. Returns `{ error } | null` --
 * same shape as lib/security/admin.ts's requireAdmin -- rather than also
 * returning the Supabase client, so the success/failure union stays a
 * clean two-member discriminated-by-null type instead of a three-way
 * object union TypeScript's `"error" in auth` narrowing handles poorly.
 * Callers that need a client after this passes create their own via
 * createSupabaseServerClient() (cheap -- cookie-based, no extra network
 * call), same as modules/crawl-audit/actions.ts's requireSignedIn.
 */
async function requireWorkspaceOwner(workspaceId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be signed in." };

  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!membership || membership.role !== "owner") {
    return { error: "Only a workspace owner can manage billing." };
  }

  return null;
}

export type StartCheckoutResult =
  { error: string } | { ok: true; razorpaySubscriptionId: string; razorpayKeyId: string };

/**
 * Server Action: starts a Razorpay Checkout for a plan-tier upgrade.
 * Creates the Razorpay subscription (status `created`), records it in
 * `subscriptions` via create_pending_subscription (migration 0023, which
 * re-checks ownership itself), and returns the id + publishable key id the
 * client needs to open Razorpay's Checkout.js modal. The plan only becomes
 * active once the customer completes Checkout AND the webhook confirms it
 * (app/src/app/api/webhooks/razorpay/route.ts) -- this action's own return
 * value is not the source of truth for plan state.
 */
export async function startCheckoutAction(
  workspaceId: string,
  planTier: PaidPlanTierId,
): Promise<StartCheckoutResult> {
  if (!isPaidPlanTier(planTier)) {
    return { error: "Invalid plan tier." };
  }

  if (!isRazorpayConfigured()) {
    return {
      error:
        "Billing is not configured yet -- this deployment has no live Razorpay account connected. " +
        "See the Billing & Subscription module's tracker for what's needed.",
    };
  }

  const razorpayPlanId = getRazorpayPlanId(planTier);
  if (!razorpayPlanId) {
    return {
      error: `No Razorpay Plan id is configured for the ${PLAN_CATALOG[planTier].name} tier yet.`,
    };
  }

  const authError = await requireWorkspaceOwner(workspaceId);
  if (authError) return authError;

  let subscription;
  try {
    subscription = await createRazorpaySubscription({
      planId: razorpayPlanId,
      notes: { workspace_id: workspaceId, plan_tier: planTier },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error creating subscription";
    return { error: message };
  }

  const supabase = await createSupabaseServerClient();
  const { error: rpcError } = await supabase.rpc("create_pending_subscription", {
    p_workspace_id: workspaceId,
    p_razorpay_subscription_id: subscription.id,
    p_razorpay_plan_id: razorpayPlanId,
    p_plan_tier: planTier,
  });

  if (rpcError) {
    return { error: rpcError.message };
  }

  return {
    ok: true,
    razorpaySubscriptionId: subscription.id,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  };
}

export type ChangePlanResult = { error: string } | { ok: true };

/**
 * Server Action: switches an already-paying workspace to a different paid
 * tier. Requires an existing `subscriptions` row with a real
 * razorpay_subscription_id (i.e. checkout must have already been completed
 * once via startCheckoutAction) -- a Free-plan workspace with no
 * subscription yet should call startCheckoutAction instead, not this.
 */
export async function changePlanAction(
  workspaceId: string,
  newPlanTier: PaidPlanTierId,
): Promise<ChangePlanResult> {
  if (!isPaidPlanTier(newPlanTier)) {
    return { error: "Invalid plan tier." };
  }

  if (!isRazorpayConfigured()) {
    return {
      error:
        "Billing is not configured yet -- this deployment has no live Razorpay account connected.",
    };
  }

  const newRazorpayPlanId = getRazorpayPlanId(newPlanTier);
  if (!newRazorpayPlanId) {
    return {
      error: `No Razorpay Plan id is configured for the ${PLAN_CATALOG[newPlanTier].name} tier yet.`,
    };
  }

  const authError = await requireWorkspaceOwner(workspaceId);
  if (authError) return authError;

  const supabase = await createSupabaseServerClient();
  const { data: subscription, error: fetchError } = await supabase
    .from("subscriptions")
    .select("razorpay_subscription_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!subscription?.razorpay_subscription_id) {
    return { error: "No active subscription to change. Start a new checkout instead." };
  }

  try {
    await updateRazorpaySubscription({
      subscriptionId: subscription.razorpay_subscription_id,
      newPlanId: newRazorpayPlanId,
      notes: { workspace_id: workspaceId, plan_tier: newPlanTier },
      scheduleChangeAt: "now",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error changing plan";
    return { error: message };
  }

  return { ok: true };
}

export type CancelSubscriptionResult = { error: string } | { ok: true };

/**
 * Server Action: requests cancellation of the workspace's active
 * subscription. Graceful by default (`cancel_at_cycle_end`) -- access
 * continues until the current paid period ends. Does not write
 * `subscriptions.status` itself; that only changes once the
 * `subscription.updated`/`subscription.cancelled` webhook arrives, since
 * Razorpay -- not this action -- is the source of truth for when
 * cancellation actually takes effect.
 */
export async function cancelSubscriptionAction(
  workspaceId: string,
  razorpaySubscriptionId: string,
): Promise<CancelSubscriptionResult> {
  if (!isRazorpayConfigured()) {
    return {
      error:
        "Billing is not configured yet -- this deployment has no live Razorpay account connected.",
    };
  }

  const authError = await requireWorkspaceOwner(workspaceId);
  if (authError) return authError;

  try {
    await cancelRazorpaySubscription(razorpaySubscriptionId, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error cancelling subscription";
    return { error: message };
  }

  return { ok: true };
}
