/**
 * Module 5.9 — thin wrapper around the Razorpay REST API.
 *
 * Deliberately not the `razorpay` npm SDK: the SDK is a thin fetch wrapper
 * itself, and calling the documented REST endpoints directly with `fetch`
 * keeps this module's only new dependency at zero, matching this project's
 * existing preference (see docs/CONVENTIONS.md) for provider abstractions
 * built on plain `fetch` over vendor SDKs (see lib/ai-providers/*).
 *
 * `server-only` makes an accidental client-bundle import of RAZORPAY_KEY_ID/
 * RAZORPAY_KEY_SECRET a build-time error, not just a code-review convention
 * (docs/CONVENTIONS.md Section 6, "Never expose a server secret to the
 * frontend" -- same pattern as supabase-service-role.ts).
 *
 * Endpoints used, per https://razorpay.com/docs/api/subscriptions/:
 *   POST /v1/subscriptions              -- create
 *   POST /v1/subscriptions/:id/cancel   -- cancel (immediate or at cycle end)
 * Authenticated via HTTP Basic Auth, `key_id:key_secret` base64-encoded.
 */
import "server-only";
import { PAID_PLAN_TIER_IDS, getRazorpayPlanId } from "./plans";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

// Razorpay requires a bounded `total_count` (number of billing cycles) even
// for subscriptions meant to run "until cancelled" -- there is no literal
// infinite option. 120 monthly cycles = 10 years, long enough that no real
// customer will hit it; the subscription can still be cancelled at any time
// before then via cancelRazorpaySubscription below regardless of this count.
export const SUBSCRIPTION_TOTAL_COUNT = 120;

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/**
 * True only when Razorpay is fully ready to take a real payment: API keys
 * present AND every paid tier has a real Plan id configured. This is
 * deliberately stricter than isRazorpayConfigured() above, which only
 * proves the API keys exist.
 *
 * Found live 2026-09-01: this deployment has real (test) RAZORPAY_KEY_ID/
 * RAZORPAY_KEY_SECRET set, so isRazorpayConfigured() returns true and
 * Settings -> Billing rendered live "Upgrade" buttons -- but no
 * RAZORPAY_PLAN_ID_* env vars are set, so clicking one threw
 * startCheckoutAction's internal "No Razorpay Plan id is configured for
 * the X tier yet." error straight at the customer instead of the
 * "payments on hold" message that code path was written for. Settings'
 * page.tsx now gates on this function instead, so the on-hold message
 * shows whenever *either* piece is missing, not just when the keys are.
 */
export function isBillingFullyConfigured(): boolean {
  return (
    isRazorpayConfigured() && PAID_PLAN_TIER_IDS.every((tier) => getRazorpayPlanId(tier) !== null)
  );
}

function getAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay is not configured: RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are not set. " +
        "This requires a real Razorpay account -- see this module's tracker Blockers.",
    );
  }
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

async function razorpayRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(`Razorpay API ${path} failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
}

export interface RazorpaySubscriptionResponse {
  id: string;
  plan_id: string;
  status: string;
  [key: string]: unknown;
}

/**
 * Creates a Razorpay subscription in `created` status. The customer still
 * has to complete the Razorpay Checkout flow (client-side, using the
 * returned id) before it moves to `authenticated`/`active` -- that
 * transition arrives later via webhook, not this call's response.
 */
export async function createRazorpaySubscription(params: {
  planId: string;
  notes: Record<string, string>;
}): Promise<RazorpaySubscriptionResponse> {
  return razorpayRequest<RazorpaySubscriptionResponse>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: params.planId,
      total_count: SUBSCRIPTION_TOTAL_COUNT,
      customer_notify: 1,
      notes: params.notes,
    }),
  });
}

/**
 * Changes an existing subscription's plan (upgrade/downgrade between
 * Starter/Growth/Agency). Razorpay has no separate "change plan" endpoint --
 * this is the same PATCH /v1/subscriptions/:id Razorpay itself documents for
 * plan changes (https://razorpay.com/docs/api/subscriptions/update/).
 *
 * `notes` is re-sent with the new `plan_tier` deliberately: the webhook
 * route (app/src/app/api/webhooks/razorpay/route.ts) resolves which
 * workspace/tier a webhook is about entirely from the subscription entity's
 * `notes`, which Razorpay otherwise leaves untouched from creation-time --
 * without updating it here, a `subscription.updated` webhook after this
 * call would report the *old* plan_tier back into the DB via stale notes.
 *
 * `scheduleChangeAt: "now"` applies immediately (prorated by Razorpay);
 * `"cycle_end"` applies at the next billing cycle. This module's UI uses
 * "now" for both upgrades and downgrades to keep behavior simple and
 * predictable rather than silently deferring a downgrade.
 */
export async function updateRazorpaySubscription(params: {
  subscriptionId: string;
  newPlanId: string;
  notes: Record<string, string>;
  scheduleChangeAt?: "now" | "cycle_end";
}): Promise<RazorpaySubscriptionResponse> {
  return razorpayRequest<RazorpaySubscriptionResponse>(
    `/subscriptions/${encodeURIComponent(params.subscriptionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        plan_id: params.newPlanId,
        schedule_change_at: params.scheduleChangeAt ?? "now",
        customer_notify: 1,
        notes: params.notes,
      }),
    },
  );
}

/**
 * Cancels a subscription. `cancelAtCycleEnd: true` keeps access until the
 * current paid period ends (the graceful default this module's UI uses);
 * `false` revokes immediately. Either way the DB's `subscriptions.status`
 * only changes once the corresponding webhook arrives -- this call does not
 * write to Postgres itself.
 */
export async function cancelRazorpaySubscription(
  subscriptionId: string,
  cancelAtCycleEnd: boolean,
): Promise<RazorpaySubscriptionResponse> {
  return razorpayRequest<RazorpaySubscriptionResponse>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 }),
    },
  );
}
