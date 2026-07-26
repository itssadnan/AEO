import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildExplanationPrompt } from "@/modules/scoring-explanation/prompt";
import { parseExplanationResponse } from "@/modules/scoring-explanation/parse-explanation-response";
import { explanationResultSchema } from "@/modules/scoring-explanation/schemas";
import { AiProviderError } from "@/lib/ai-providers/errors";
import type { ExplanationResult } from "@/modules/scoring-explanation/schemas";

describe("Module 5.5 — Visibility Scoring & Explanation Engine", () => {
  describe("buildExplanationPrompt", () => {
    const baseInput = {
      brandName: "Acme Corp",
      competitorName: "Globex",
      brandMentionCount: 15,
      competitorMentionCount: 45,
      citationRatio: 3,
      brandCitationProfile: [
        { domain_type: "review_site", pct: 40 },
        { domain_type: "comparison_page", pct: 35 },
        { domain_type: "forum", pct: 25 },
      ],
      competitorCitationProfile: [
        { domain_type: "review_site", pct: 50 },
        { domain_type: "comparison_page", pct: 30 },
        { domain_type: "documentation", pct: 20 },
      ],
      opportunityGaps: [
        {
          domain_type: "documentation",
          competitor_citation_count: 9,
          competitor_pct: 20,
          brand_citation_count: 0,
        },
      ],
    };

    it("includes brand name, competitor name, and mention counts", () => {
      const prompt = buildExplanationPrompt(baseInput);

      assert.ok(prompt.includes("BRAND: Acme Corp"));
      assert.ok(prompt.includes("COMPETITOR: Globex"));
      assert.ok(prompt.includes("mentioned in 15 tracked checks"));
      assert.ok(prompt.includes("mentioned in 45 tracked checks"));
      assert.ok(prompt.includes("3x more than the brand"));
    });

    it("includes brand citation profile with percentages", () => {
      const prompt = buildExplanationPrompt(baseInput);

      assert.ok(prompt.includes("- review_site: 40% of the brand's citations"));
      assert.ok(prompt.includes("- comparison_page: 35% of the brand's citations"));
      assert.ok(prompt.includes("- forum: 25% of the brand's citations"));
    });

    it("includes competitor citation profile with percentages", () => {
      const prompt = buildExplanationPrompt(baseInput);

      assert.ok(prompt.includes("- review_site: 50% of Globex's citations"));
      assert.ok(prompt.includes("- comparison_page: 30% of Globex's citations"));
      assert.ok(prompt.includes("- documentation: 20% of Globex's citations"));
    });

    it("includes opportunity gaps with specific numbers", () => {
      const prompt = buildExplanationPrompt(baseInput);

      assert.ok(prompt.includes("OPPORTUNITY GAPS"));
      assert.ok(
        prompt.includes(
          "documentation: Globex has 9 citations there (20% of its total citations); Acme Corp has zero",
        ),
      );
    });

    it("does not instruct the model to compute or re-derive the citation ratio", () => {
      const prompt = buildExplanationPrompt(baseInput);

      assert.ok(prompt.includes("do not recalculate, restate differently, or invent any number"));
    });

    it("handles empty brand citation profile", () => {
      const prompt = buildExplanationPrompt({
        ...baseInput,
        brandCitationProfile: [],
      });

      assert.ok(prompt.includes("(no citation data)"));
    });

    it("handles empty competitor citation profile", () => {
      const prompt = buildExplanationPrompt({
        ...baseInput,
        competitorCitationProfile: [],
      });

      assert.ok(prompt.includes("(no citation data)"));
    });

    it("handles empty opportunity gaps", () => {
      const prompt = buildExplanationPrompt({
        ...baseInput,
        opportunityGaps: [],
      });

      assert.ok(prompt.includes("(no zero-presence gaps found)"));
    });

    it("includes strict JSON output instructions", () => {
      const prompt = buildExplanationPrompt(baseInput);

      assert.ok(prompt.includes("Return ONLY a single JSON object"));
      assert.ok(prompt.includes("explanation_text"));
      assert.ok(prompt.includes("recommended_actions"));
      assert.ok(prompt.includes("action"));
      assert.ok(prompt.includes("confidence"));
      assert.ok(prompt.includes("rationale"));
    });

    it("includes all strict rules, using a qualitative confidence rubric rather than a numeric threshold", () => {
      const prompt = buildExplanationPrompt(baseInput);

      assert.ok(prompt.includes("STRICT RULES"));
      assert.ok(prompt.includes("1-4 sentences"));
      assert.ok(prompt.includes("specific fact from the data below"));
      assert.ok(prompt.includes("judgment call, not a calculation"));
      assert.ok(prompt.includes("directly motivates the action"));
      assert.ok(
        prompt.includes("Do not grade confidence by comparing any percentage to a threshold"),
      );
      assert.ok(!prompt.includes("competitor_pct >"));
      assert.ok(prompt.includes("improve SEO"));
      assert.ok(prompt.includes("create more content"));
      assert.ok(prompt.includes("weakest cited domain_type"));
    });
  });

  describe("parseExplanationResponse", () => {
    const validResponse = `{
      "explanation_text": "Globex is mentioned 3x more often than Acme Corp, primarily due to stronger presence on documentation sites (20% of Globex's citations vs 0% for Acme).",
      "recommended_actions": [
        {
          "action": "Publish technical documentation and API guides on developer portals to close the documentation gap where Globex has 20% of citations",
          "confidence": "high",
          "rationale": "Globex's 20% documentation citation share vs Acme's 0% represents the largest domain-type gap"
        },
        {
          "action": "Encourage customer reviews on G2 and Capterra to boost review_site citations",
          "confidence": "medium",
          "rationale": "Globex has 50% review_site citations vs Acme's 40%, a moderate advantage"
        }
      ]
    }`;

    it("parses valid JSON response", () => {
      const result = parseExplanationResponse(validResponse);

      assert.equal(
        result.explanation_text,
        "Globex is mentioned 3x more often than Acme Corp, primarily due to stronger presence on documentation sites (20% of Globex's citations vs 0% for Acme).",
      );
      assert.equal(result.recommended_actions.length, 2);
      assert.equal(
        result.recommended_actions[0].action,
        "Publish technical documentation and API guides on developer portals to close the documentation gap where Globex has 20% of citations",
      );
      assert.equal(result.recommended_actions[0].confidence, "high");
      assert.equal(
        result.recommended_actions[0].rationale,
        "Globex's 20% documentation citation share vs Acme's 0% represents the largest domain-type gap",
      );
      assert.equal(result.recommended_actions[1].confidence, "medium");
    });

    it("strips markdown code fences", () => {
      const fenced = `\`\`\`json
${validResponse}
\`\`\``;

      const result = parseExplanationResponse(fenced);
      assert.equal(result.explanation_text.includes("Globex is mentioned"), true);
    });

    it("throws on malformed JSON", () => {
      assert.throws(
        () => parseExplanationResponse("not valid json {"),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("throws when explanation_text is missing", () => {
      const invalid = `{
        "recommended_actions": [
          { "action": "Test", "confidence": "high", "rationale": "Test" }
        ]
      }`;

      assert.throws(
        () => parseExplanationResponse(invalid),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("throws when explanation_text is empty", () => {
      const invalid = `{
        "explanation_text": "",
        "recommended_actions": [
          { "action": "Test", "confidence": "high", "rationale": "Test" }
        ]
      }`;

      assert.throws(
        () => parseExplanationResponse(invalid),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("throws when explanation_text exceeds 1000 chars", () => {
      const invalid = `{
        "explanation_text": "${"x".repeat(1001)}",
        "recommended_actions": [
          { "action": "Test", "confidence": "high", "rationale": "Test" }
        ]
      }`;

      assert.throws(
        () => parseExplanationResponse(invalid),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("throws when recommended_actions is empty", () => {
      const invalid = `{
        "explanation_text": "Test explanation",
        "recommended_actions": []
      }`;

      assert.throws(
        () => parseExplanationResponse(invalid),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("throws when recommended_actions exceeds 10 items", () => {
      const actions = Array.from({ length: 11 }, (_, i) => ({
        action: `Action ${i}`,
        confidence: "high" as const,
        rationale: "Test rationale",
      }));
      const invalid = JSON.stringify({
        explanation_text: "Test explanation",
        recommended_actions: actions,
      });

      assert.throws(
        () => parseExplanationResponse(invalid),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("validates action max length", () => {
      const invalid = `{
        "explanation_text": "Test explanation",
        "recommended_actions": [
          { "action": "${"x".repeat(301)}", "confidence": "high", "rationale": "Test" }
        ]
      }`;

      assert.throws(
        () => parseExplanationResponse(invalid),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("validates confidence enum", () => {
      const invalid = `{
        "explanation_text": "Test explanation",
        "recommended_actions": [
          { "action": "Test", "confidence": "invalid", "rationale": "Test" }
        ]
      }`;

      assert.throws(
        () => parseExplanationResponse(invalid),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("validates rationale max length", () => {
      const invalid = `{
        "explanation_text": "Test explanation",
        "recommended_actions": [
          { "action": "Test", "confidence": "high", "rationale": "${"x".repeat(501)}" }
        ]
      }`;

      assert.throws(
        () => parseExplanationResponse(invalid),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("accepts all valid confidence values", () => {
      for (const confidence of ["high", "medium", "low"] as const) {
        const valid = `{
          "explanation_text": "Test explanation",
          "recommended_actions": [
            { "action": "Test", "confidence": "${confidence}", "rationale": "Test rationale" }
          ]
        }`;

        const result = parseExplanationResponse(valid);
        assert.equal(result.recommended_actions[0].confidence, confidence);
      }
    });
  });

  describe("explanationResultSchema", () => {
    it("validates a complete valid explanation result", () => {
      const valid: ExplanationResult = {
        explanation_text: "Globex has 3x more mentions than Acme, mainly from documentation sites.",
        recommended_actions: [
          {
            action: "Create technical documentation on developer portals",
            confidence: "high",
            rationale: "Globex has 20% documentation citations vs Acme's 0%",
          },
        ],
      };

      const result = explanationResultSchema.safeParse(valid);
      assert.equal(result.success, true);
    });

    it("rejects missing explanation_text", () => {
      const invalid = {
        recommended_actions: [{ action: "Test", confidence: "high" as const, rationale: "Test" }],
      };

      const result = explanationResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("rejects empty explanation_text", () => {
      const invalid = {
        explanation_text: "",
        recommended_actions: [{ action: "Test", confidence: "high" as const, rationale: "Test" }],
      };

      const result = explanationResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("rejects explanation_text over 1000 chars", () => {
      const invalid = {
        explanation_text: "x".repeat(1001),
        recommended_actions: [{ action: "Test", confidence: "high" as const, rationale: "Test" }],
      };

      const result = explanationResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("rejects empty recommended_actions array", () => {
      const invalid = {
        explanation_text: "Test explanation",
        recommended_actions: [],
      };

      const result = explanationResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("rejects recommended_actions over 10 items", () => {
      const invalid = {
        explanation_text: "Test explanation",
        recommended_actions: Array.from({ length: 11 }, (_, i) => ({
          action: `Action ${i}`,
          confidence: "high" as const,
          rationale: "Test rationale",
        })),
      };

      const result = explanationResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("rejects invalid confidence value", () => {
      const invalid = {
        explanation_text: "Test explanation",
        recommended_actions: [{ action: "Test", confidence: "invalid", rationale: "Test" }],
      };

      const result = explanationResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("rejects action over 300 chars", () => {
      const invalid = {
        explanation_text: "Test explanation",
        recommended_actions: [
          { action: "x".repeat(301), confidence: "high" as const, rationale: "Test" },
        ],
      };

      const result = explanationResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("rejects rationale over 500 chars", () => {
      const invalid = {
        explanation_text: "Test explanation",
        recommended_actions: [
          { action: "Test", confidence: "high" as const, rationale: "x".repeat(501) },
        ],
      };

      const result = explanationResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });
  });
});
