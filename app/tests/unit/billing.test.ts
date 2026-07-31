import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyRazorpayWebhookSignature } from "../../src/modules/billing/webhook-verify.ts";
import {
  PLAN_CATALOG,
  PAID_PLAN_TIER_IDS,
  isPaidPlanTier,
  getRazorpayPlanId,
} from "../../src/modules/billing/plans.ts";
import {
  razorpayWebhookPayloadSchema,
  subscriptionNotesSchema,
  paidPlanTierSchema,
} from "../../src/modules/billing/schemas.ts";

describe("Billing: webhook signature verification", () => {
  const secret = "whsec_test_secret";
  const rawBody = JSON.stringify({ entity: "event", event: "subscription.activated" });

  function sign(body: string, key: string): string {
    return createHmac("sha256", key).update(body, "utf8").digest("hex");
  }

  it("accepts a correctly signed payload", () => {
    const signature = sign(rawBody, secret);
    assert.equal(verifyRazorpayWebhookSignature(rawBody, signature, secret), true);
  });

  it("rejects a tampered body against the original signature", () => {
    const signature = sign(rawBody, secret);
    const tamperedBody = rawBody.replace("activated", "cancelled");
    assert.equal(verifyRazorpayWebhookSignature(tamperedBody, signature, secret), false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const wrongSignature = sign(rawBody, "wrong_secret");
    assert.equal(verifyRazorpayWebhookSignature(rawBody, wrongSignature, secret), false);
  });

  it("rejects a missing signature header", () => {
    assert.equal(verifyRazorpayWebhookSignature(rawBody, null, secret), false);
    assert.equal(verifyRazorpayWebhookSignature(rawBody, undefined, secret), false);
  });

  it("rejects an empty webhook secret", () => {
    const signature = sign(rawBody, secret);
    assert.equal(verifyRazorpayWebhookSignature(rawBody, signature, ""), false);
  });

  it("does not throw on a garbage/short signature header (length-mismatch guard)", () => {
    assert.doesNotThrow(() =>
      verifyRazorpayWebhookSignature(rawBody, "not-hex-and-too-short", secret),
    );
    assert.equal(verifyRazorpayWebhookSignature(rawBody, "not-hex-and-too-short", secret), false);
  });
});

describe("Billing: plan catalog", () => {
  it("has exactly the four real plan_tier values used by the DB CHECK constraints", () => {
    assert.deepEqual(Object.keys(PLAN_CATALOG).sort(), ["agency", "free", "growth", "starter"]);
  });

  it("mirrors migration 0005's per-brand prompt limits (Starter 25 / Growth 75 / Agency 200)", () => {
    assert.equal(PLAN_CATALOG.starter.promptLimit, 25);
    assert.equal(PLAN_CATALOG.growth.promptLimit, 75);
    assert.equal(PLAN_CATALOG.agency.promptLimit, 200);
  });

  it("mirrors migration 0023's per-workspace brand limits (Starter 1 / Growth 3 / Agency 50)", () => {
    assert.equal(PLAN_CATALOG.starter.brandLimit, 1);
    assert.equal(PLAN_CATALOG.growth.brandLimit, 3);
    assert.equal(PLAN_CATALOG.agency.brandLimit, 50);
  });

  it("mirrors migration 0007's check-frequency split (Starter weekly, Growth/Agency daily)", () => {
    assert.equal(PLAN_CATALOG.starter.checkFrequency, "weekly");
    assert.equal(PLAN_CATALOG.growth.checkFrequency, "daily");
    assert.equal(PLAN_CATALOG.agency.checkFrequency, "daily");
  });

  it("every paid tier has a distinct razorpayPlanIdEnvVar and free has none", () => {
    const envVars = PAID_PLAN_TIER_IDS.map((tier) => PLAN_CATALOG[tier].razorpayPlanIdEnvVar);
    assert.equal(new Set(envVars).size, envVars.length);
    assert.equal(PLAN_CATALOG.free.razorpayPlanIdEnvVar, null);
  });

  it("isPaidPlanTier correctly excludes free", () => {
    assert.equal(isPaidPlanTier("free"), false);
    assert.equal(isPaidPlanTier("starter"), true);
    assert.equal(isPaidPlanTier("growth"), true);
    assert.equal(isPaidPlanTier("agency"), true);
    assert.equal(isPaidPlanTier("bogus"), false);
  });

  it("getRazorpayPlanId returns null (not a throw) when the env var is unset", () => {
    delete process.env.RAZORPAY_PLAN_ID_STARTER;
    assert.equal(getRazorpayPlanId("starter"), null);
  });

  it("getRazorpayPlanId reads the real env var once set", () => {
    process.env.RAZORPAY_PLAN_ID_STARTER = "plan_test123";
    assert.equal(getRazorpayPlanId("starter"), "plan_test123");
    delete process.env.RAZORPAY_PLAN_ID_STARTER;
  });
});

describe("Billing: Zod schemas against real Razorpay payload shapes", () => {
  // Shape confirmed against Razorpay's documented webhook payload
  // (https://razorpay.com/docs/webhooks/payloads/subscriptions/), not
  // guessed.
  const realisticActivatedPayload = {
    entity: "event",
    account_id: "acc_BFQ7uQEaa7j2z9",
    event: "subscription.activated",
    contains: ["subscription"],
    payload: {
      subscription: {
        entity: {
          id: "sub_00000000000001",
          plan_id: "plan_00000000000001",
          status: "active",
          current_start: 1735689600,
          current_end: 1738368000,
          notes: {
            workspace_id: "11111111-1111-4111-8111-111111111111",
            plan_tier: "growth",
          },
        },
      },
    },
    created_at: 1735689600,
  };

  it("parses a realistic subscription.activated payload", () => {
    const result = razorpayWebhookPayloadSchema.safeParse(realisticActivatedPayload);
    assert.equal(result.success, true);
  });

  it("rejects an unrecognized event name rather than silently accepting it", () => {
    const result = razorpayWebhookPayloadSchema.safeParse({
      ...realisticActivatedPayload,
      event: "subscription.some_future_event_not_yet_supported",
    });
    assert.equal(result.success, false);
  });

  it("rejects a payload missing the required `contains` field", () => {
    const { contains: _contains, ...withoutContains } = realisticActivatedPayload;
    const result = razorpayWebhookPayloadSchema.safeParse(withoutContains);
    assert.equal(result.success, false);
  });

  it("accepts a payload with no subscription entity (e.g. a payment.* event) via the optional field", () => {
    const result = razorpayWebhookPayloadSchema.safeParse({
      entity: "event",
      event: "subscription.activated",
      contains: ["payment"],
      payload: {},
      created_at: 1735689600,
    });
    assert.equal(result.success, true);
  });

  it("parses valid subscription notes", () => {
    const result = subscriptionNotesSchema.safeParse({
      workspace_id: "11111111-1111-4111-8111-111111111111",
      plan_tier: "agency",
    });
    assert.equal(result.success, true);
  });

  it("rejects subscription notes with a non-UUID workspace_id", () => {
    const result = subscriptionNotesSchema.safeParse({
      workspace_id: "not-a-uuid",
      plan_tier: "agency",
    });
    assert.equal(result.success, false);
  });

  it("rejects subscription notes with plan_tier 'free' (not a real paid-plan value)", () => {
    const result = subscriptionNotesSchema.safeParse({
      workspace_id: "11111111-1111-4111-8111-111111111111",
      plan_tier: "free",
    });
    assert.equal(result.success, false);
  });

  it("paidPlanTierSchema accepts only the three paid tiers", () => {
    assert.equal(paidPlanTierSchema.safeParse("starter").success, true);
    assert.equal(paidPlanTierSchema.safeParse("growth").success, true);
    assert.equal(paidPlanTierSchema.safeParse("agency").success, true);
    assert.equal(paidPlanTierSchema.safeParse("free").success, false);
  });
});
