// Module 5.9 Billing & Subscription
// See progress/modules/5.9-billing-and-subscription.md for acceptance
// criteria, decisions log, caching/security notes.
// Per docs/CONVENTIONS.md: nothing outside this folder may import from
// inside it directly, only through this index.ts.

export { PLAN_CATALOG, PAID_PLAN_TIER_IDS, isPaidPlanTier, getRazorpayPlanId } from "./plans";
export type { PlanTierId, PaidPlanTierId, PlanDefinition } from "./plans";

export {
  razorpayWebhookPayloadSchema,
  razorpaySubscriptionEntitySchema,
  razorpaySubscriptionStatusSchema,
  razorpayWebhookEventNameSchema,
  subscriptionNotesSchema,
  paidPlanTierSchema,
} from "./schemas";
export type {
  RazorpayWebhookPayload,
  RazorpaySubscriptionEntity,
  SubscriptionNotes,
} from "./schemas";

export { verifyRazorpayWebhookSignature } from "./webhook-verify";

export {
  isRazorpayConfigured,
  isBillingFullyConfigured,
  SUBSCRIPTION_TOTAL_COUNT,
} from "./razorpay-client";

export { getSubscriptionForWorkspace, getUsageSnapshot } from "./queries";
export type { SubscriptionRow, UsageSnapshot } from "./queries";

export { startCheckoutAction, changePlanAction, cancelSubscriptionAction } from "./actions";
export type { StartCheckoutResult, ChangePlanResult, CancelSubscriptionResult } from "./actions";
