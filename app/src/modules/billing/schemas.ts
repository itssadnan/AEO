/**
 * Module 5.9 — Billing & Subscription: Zod schemas.
 *
 * Every schema here validates untrusted input before it is trusted: the
 * Razorpay webhook body (an unauthenticated POST from the public internet,
 * verified by HMAC signature in webhook-verify.ts *before* this parsing
 * even runs, per docs/CONVENTIONS.md Section 6) and the plan-tier value a
 * client passes into a checkout Server Action.
 *
 * Shape grounded in Razorpay's real, documented webhook payload
 * (https://razorpay.com/docs/webhooks/payloads/subscriptions/ and
 * https://razorpay.com/docs/api/subscriptions/) — not guessed:
 *   {
 *     entity: "event",
 *     account_id: "acc_...",
 *     event: "subscription.activated",
 *     contains: ["subscription"],
 *     payload: { subscription: { entity: { id, plan_id, status, current_end, notes, ... } } },
 *     created_at: 1234567890
 *   }
 * `current_end`/`current_start` are Unix seconds on the subscription entity.
 * `notes` is an arbitrary string->string map Razorpay echoes back unchanged
 * from whatever was set at subscription creation -- this module uses it to
 * carry `workspace_id`/`plan_tier`, since Razorpay's webhook has no
 * Supabase session to resolve them from otherwise (see razorpay-client.ts).
 */
import { z } from "zod";
import { PAID_PLAN_TIER_IDS } from "./plans";

export const paidPlanTierSchema = z.enum(PAID_PLAN_TIER_IDS as [string, ...string[]]);

// Real Razorpay Subscription entity status values (Razorpay's documented
// lifecycle: created -> authenticated -> active -> (pending -> halted, on
// payment retry) -> (cancelled | completed | expired); also paused/resumed).
// Matches the exact `status in (...)` list in migration 0023's `subscriptions`
// table CHECK constraint -- keep these two in sync by hand.
export const razorpaySubscriptionStatusSchema = z.enum([
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
  "paused",
  "cancelled",
  "completed",
  "expired",
]);

export const razorpaySubscriptionEntitySchema = z.object({
  id: z.string(),
  plan_id: z.string(),
  status: razorpaySubscriptionStatusSchema,
  current_start: z.number().int().nullable().optional(),
  current_end: z.number().int().nullable().optional(),
  notes: z.record(z.string(), z.string()).optional().default({}),
});

export type RazorpaySubscriptionEntity = z.infer<typeof razorpaySubscriptionEntitySchema>;

// Real Razorpay subscription webhook event names actually documented by
// Razorpay. Anything else is rejected rather than silently ignored, so an
// unrecognized event shows up as a real parse failure the webhook route
// logs, not a swallowed no-op.
export const razorpayWebhookEventNameSchema = z.enum([
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.completed",
  "subscription.updated",
  "subscription.pending",
  "subscription.halted",
  "subscription.paused",
  "subscription.resumed",
  "subscription.cancelled",
]);

export const razorpayWebhookPayloadSchema = z.object({
  entity: z.literal("event"),
  account_id: z.string().optional(),
  event: razorpayWebhookEventNameSchema,
  contains: z.array(z.string()),
  payload: z.object({
    subscription: z
      .object({
        entity: razorpaySubscriptionEntitySchema,
      })
      .optional(),
  }),
  created_at: z.number(),
});

export type RazorpayWebhookPayload = z.infer<typeof razorpayWebhookPayloadSchema>;

/**
 * Notes attached to every subscription this module creates (see
 * razorpay-client.ts's createRazorpaySubscription) and read back out of the
 * webhook payload above. Validated separately since `notes` on the entity
 * schema above is deliberately loose (`Record<string,string>`, since
 * Razorpay's own type is an open string map) -- this is the stricter shape
 * this module actually requires to act on a webhook.
 */
export const subscriptionNotesSchema = z.object({
  workspace_id: z.string().uuid(),
  plan_tier: paidPlanTierSchema,
});

export type SubscriptionNotes = z.infer<typeof subscriptionNotesSchema>;
