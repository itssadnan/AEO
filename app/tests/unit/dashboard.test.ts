import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapPlanTier } from "../../src/modules/dashboard/plan-tier.ts";
import { shapeExplanationEngineData } from "../../src/modules/dashboard/explanation-engine.ts";
import type { VisibilitySnapshotRow } from "../../src/modules/dashboard/database-extensions.ts";

/** Minimal-but-real visibility_snapshots row (migration 0016) -- every test
 * below overrides only the fields it cares about. */
function baseSnapshot(overrides: Partial<VisibilitySnapshotRow> = {}): VisibilitySnapshotRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    brand_id: "22222222-2222-2222-2222-222222222222",
    workspace_id: "33333333-3333-3333-3333-333333333333",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    score: 40,
    mention_count: 5,
    avg_rank: 2.5,
    share_of_voice: {
      total_checks: 10,
      brand: { name: "Growfin", mention_count: 5, share_pct: 50 },
      competitors: [{ name: "HighRadius", mention_count: 15, share_pct: 150 }],
    },
    source_influence: [
      { domain_type: "review_site", citation_count: 4, pct: 40 },
      { domain_type: "documentation", citation_count: 6, pct: 60 },
    ],
    explanation_breakdown: null,
    opportunity_gaps: [],
    recommended_actions: null,
    explanation_skip_reason: null,
    status: "not_applicable",
    attempts: 0,
    claimed_at: null,
    last_error_code: null,
    explanation_provider: null,
    explanation_model: null,
    explanation_completed_at: null,
    generated_at: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

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

  describe("shapeExplanationEngineData", () => {
    it("no snapshot at all -> 'no_data', every field falls back to null/empty rather than throwing", () => {
      const result = shapeExplanationEngineData(null);
      assert.equal(result.status, "no_data");
      assert.equal(result.competitorName, null);
      assert.deepEqual(result.brandCitationProfile, []);
      assert.deepEqual(result.opportunityGaps, []);
      assert.deepEqual(result.recommendedActions, []);
    });

    it("explanation_skip_reason='free_plan' -> 'free_plan', regardless of status", () => {
      const result = shapeExplanationEngineData(
        baseSnapshot({ explanation_skip_reason: "free_plan", status: "not_applicable" }),
      );
      assert.equal(result.status, "free_plan");
    });

    it("explanation_skip_reason='no_competitor_ahead' -> that status, and still surfaces the brand's own citation profile (source_influence is computed for every plan tier, not gated)", () => {
      const result = shapeExplanationEngineData(
        baseSnapshot({ explanation_skip_reason: "no_competitor_ahead", status: "not_applicable" }),
      );
      assert.equal(result.status, "no_competitor_ahead");
      assert.deepEqual(result.brandCitationProfile, [
        { domainType: "review_site", pct: 40 },
        { domainType: "documentation", pct: 60 },
      ]);
    });

    it("status 'queued'/'processing'/'retry' with no skip_reason -> 'pending', numeric breakdown/gaps already populated (computed synchronously by SQL) even though prose hasn't arrived", () => {
      for (const status of ["queued", "processing", "retry"] as const) {
        const result = shapeExplanationEngineData(
          baseSnapshot({
            status,
            attempts: 2,
            last_error_code: status === "retry" ? "rate_limited" : null,
            explanation_breakdown: {
              competitor_name: "HighRadius",
              citation_ratio: 3,
              breakdown: [{ domain_type: "comparison_page", pct: 70 }],
            },
            opportunity_gaps: [
              {
                domain_type: "comparison_page",
                competitor_citation_count: 7,
                competitor_pct: 70,
                brand_citation_count: 0,
              },
            ],
          }),
        );
        assert.equal(result.status, "pending", `status ${status} should map to 'pending'`);
        assert.equal(result.competitorName, "HighRadius");
        assert.equal(result.citationRatio, 3);
        assert.equal(result.explanationText, null);
        assert.deepEqual(result.recommendedActions, []);
        assert.equal(result.opportunityGaps.length, 1);
        assert.equal(result.opportunityGaps[0].domainType, "comparison_page");
        assert.equal(result.attempts, 2);
      }
    });

    it("status 'completed' -> explanationText and recommendedActions are populated from the merged jsonb columns", () => {
      const result = shapeExplanationEngineData(
        baseSnapshot({
          status: "completed",
          explanation_provider: "nvidia_nim",
          explanation_model: "nemotron-3-ultra",
          explanation_breakdown: {
            competitor_name: "HighRadius",
            citation_ratio: 3,
            breakdown: [{ domain_type: "comparison_page", pct: 70 }],
            explanation_text: "HighRadius is cited 3x more, mostly via comparison pages.",
          },
          recommended_actions: [
            {
              action: "Publish a comparison page against HighRadius",
              confidence: "high",
              rationale:
                "HighRadius gets 70% of its citations from comparison pages; you have none.",
            },
          ],
        }),
      );
      assert.equal(result.status, "completed");
      assert.equal(
        result.explanationText,
        "HighRadius is cited 3x more, mostly via comparison pages.",
      );
      assert.equal(result.recommendedActions.length, 1);
      assert.equal(result.recommendedActions[0].confidence, "high");
      assert.equal(result.explanationProvider, "nvidia_nim");
    });

    it("status 'failed' -> reports attempts/lastErrorCode honestly; never fabricates prose that was never generated", () => {
      const result = shapeExplanationEngineData(
        baseSnapshot({ status: "failed", attempts: 5, last_error_code: "rate_limited" }),
      );
      assert.equal(result.status, "failed");
      assert.equal(result.attempts, 5);
      assert.equal(result.lastErrorCode, "rate_limited");
      assert.equal(result.explanationText, null);
    });

    it("defensive parsing: malformed/missing jsonb shapes degrade to empty rather than throwing", () => {
      // Every field below is still valid `Json` (a very permissive type --
      // string | number | boolean | null | object | array), just not the
      // *shape* this module actually writes -- simulating drift/corruption.
      const result = shapeExplanationEngineData(
        baseSnapshot({
          status: "completed",
          explanation_breakdown: "not an object",
          opportunity_gaps: [{ domain_type: "forum" /* missing required numeric fields */ }],
          recommended_actions: [{ action: "x", confidence: "extreme", rationale: "y" }],
          source_influence: null,
          // Also corrupt share_of_voice's competitor list, so competitorName
          // has no fallback to fall back to either (see the doc-comment on
          // that field in explanation-engine.ts).
          share_of_voice: { total_checks: 0, brand: null, competitors: [] },
        }),
      );
      assert.equal(result.competitorName, null);
      assert.deepEqual(result.opportunityGaps, []);
      assert.deepEqual(result.recommendedActions, []);
      assert.deepEqual(result.brandCitationProfile, []);
    });
  });
});
