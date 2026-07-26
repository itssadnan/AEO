import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapPlanTier } from "../../src/modules/dashboard/plan-tier.ts";

describe("Module 5.6 — Dashboard / Frontend", () => {
  describe("mapPlanTier", () => {
    it("main success path: passes through every real plan_tier value from the DB constraint unchanged", () => {
      // migration 0001: plan_tier text not null default 'free'
      //   check (plan_tier in ('free', 'starter', 'growth', 'agency'))
      assert.equal(mapPlanTier("free"), "free");
      assert.equal(mapPlanTier("starter"), "starter");
      assert.equal(mapPlanTier("growth"), "growth");
      assert.equal(mapPlanTier("agency"), "agency");
    });

    it("maps legacy 'pro'/'enterprise' aliases for backward compatibility with any pre-migration data", () => {
      assert.equal(mapPlanTier("pro"), "starter");
      assert.equal(mapPlanTier("enterprise"), "agency");
    });

    it("failure path: an unrecognized value falls back to 'free' rather than throwing or leaking an invalid tier", () => {
      assert.equal(mapPlanTier("not_a_real_tier"), "free");
      assert.equal(mapPlanTier(""), "free");
    });

    it("regression guard: 'starter' and 'growth' must never collapse to 'free' (the real bug found during independent verification of this module — every real Starter/Growth workspace was silently shown as Free throughout the dashboard because the six copy-pasted inline versions of this function only handled 'pro'/'enterprise' explicitly and defaulted everything else, including these two real values, to 'free')", () => {
      assert.notEqual(mapPlanTier("starter"), "free");
      assert.notEqual(mapPlanTier("growth"), "free");
    });
  });
});
