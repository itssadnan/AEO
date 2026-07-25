import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildExtractionPrompt } from "../../src/modules/nlp-extraction/prompt.ts";
import { parseExtractionResponse } from "../../src/modules/nlp-extraction/parse-extraction-response.ts";
import { extractionResultSchema } from "../../src/modules/nlp-extraction/schemas.ts";
import { AiProviderError } from "@/lib/ai-providers/errors";
import type { ExtractionResult } from "../../src/modules/nlp-extraction/schemas.ts";

describe("Module 5.4 — NLP Extraction & Structuring", () => {
  describe("buildExtractionPrompt", () => {
    it("includes brand name, competitors, answer text, and citations in the prompt", () => {
      const prompt = buildExtractionPrompt({
        rawAnswer: "Acme Corp is a great choice for small businesses.",
        brandName: "Acme Corp",
        competitorNames: ["Globex", "Initech"],
        citations: [
          { uri: "https://example.com/review", title: "Acme Review" },
          { uri: "https://forum.example.com/thread", title: undefined },
        ],
      });

      assert.ok(prompt.includes("BRAND: Acme Corp"));
      assert.ok(
        prompt.includes("COMPETITORS (named by the customer, not exhaustive): Globex, Initech"),
      );
      assert.ok(prompt.includes("Acme Corp is a great choice for small businesses."));
      assert.ok(prompt.includes('https://example.com/review ("Acme Review")'));
      assert.ok(prompt.includes("https://forum.example.com/thread"));
    });

    it("handles empty competitors list", () => {
      const prompt = buildExtractionPrompt({
        rawAnswer: "Acme Corp is mentioned.",
        brandName: "Acme Corp",
        competitorNames: [],
        citations: [],
      });

      assert.ok(prompt.includes("(none listed)"));
    });

    it("handles empty citations list", () => {
      const prompt = buildExtractionPrompt({
        rawAnswer: "Acme Corp is mentioned.",
        brandName: "Acme Corp",
        competitorNames: ["Globex"],
        citations: [],
      });

      assert.ok(prompt.includes("(none provided)"));
    });

    it("outputs strict JSON shape instructions", () => {
      const prompt = buildExtractionPrompt({
        rawAnswer: "Test answer.",
        brandName: "TestBrand",
        competitorNames: [],
        citations: [],
      });

      assert.ok(prompt.includes("brand_mentioned"));
      assert.ok(prompt.includes("brand_mention_evidence"));
      assert.ok(prompt.includes("position_among_competitors"));
      assert.ok(prompt.includes("reasoning"));
      assert.ok(prompt.includes("sentiment"));
      assert.ok(prompt.includes("competitor_names_found"));
      assert.ok(prompt.includes("cited_domains"));
      assert.ok(prompt.includes("cited_domain_types"));
    });

    it("includes STRICT RULES block", () => {
      const prompt = buildExtractionPrompt({
        rawAnswer: "Test answer.",
        brandName: "TestBrand",
        competitorNames: [],
        citations: [],
      });

      assert.ok(prompt.includes("STRICT RULES"));
      assert.ok(prompt.includes("brand_mentioned"));
      assert.ok(prompt.includes("competitor_names_found"));
      assert.ok(prompt.includes("(none listed)"));
    });
  });

  describe("parseExtractionResponse", () => {
    const rawAnswer = "Acme Corp is a great choice for small businesses.";

    it("parses valid JSON response with brand_mention_evidence", () => {
      const raw = `{
        "brand_mentioned": true,
        "brand_mention_evidence": "Acme Corp",
        "position_among_competitors": 1,
        "reasoning": "The answer mentions Acme first.",
        "sentiment": "positive",
        "competitor_names_found": ["Globex"],
        "cited_domains": ["example.com"],
        "cited_domain_types": [{"domain": "example.com", "type": "review_site"}]
      }`;

      const result = parseExtractionResponse(raw, rawAnswer);

      assert.equal(result.brand_mentioned, true);
      assert.equal(result.brand_mention_evidence, "Acme Corp");
      assert.equal(result.position_among_competitors, 1);
      assert.equal(result.reasoning, "The answer mentions Acme first.");
      assert.equal(result.sentiment, "positive");
      assert.deepEqual(result.competitor_names_found, ["Globex"]);
      assert.deepEqual(result.cited_domains, ["example.com"]);
      assert.deepEqual(result.cited_domain_types, [{ domain: "example.com", type: "review_site" }]);
    });

    it("strips markdown code fences", () => {
      const raw = `\`\`\`json
{
  "brand_mentioned": false,
  "brand_mention_evidence": null,
  "position_among_competitors": null,
  "reasoning": "Brand not mentioned.",
  "sentiment": "neutral",
  "competitor_names_found": [],
  "cited_domains": [],
  "cited_domain_types": []
}
\`\`\``;

      const result = parseExtractionResponse(raw, rawAnswer);
      assert.equal(result.brand_mentioned, false);
      assert.equal(result.brand_mention_evidence, null);
      assert.equal(result.position_among_competitors, null);
    });

    it("throws on malformed JSON", () => {
      const raw = `not valid json {`;

      assert.throws(
        () => parseExtractionResponse(raw, rawAnswer),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("throws on schema validation failure (missing required field)", () => {
      const raw = `{
        "brand_mentioned": true,
        "brand_mention_evidence": "Acme Corp",
        "position_among_competitors": 1,
        "reasoning": "Test",
        "sentiment": "positive",
        "competitor_names_found": [],
        "cited_domains": []
        // missing cited_domain_types
      }`;

      assert.throws(
        () => parseExtractionResponse(raw, rawAnswer),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("throws when brand_mentioned is false but position is not null", () => {
      const raw = `{
        "brand_mentioned": false,
        "brand_mention_evidence": null,
        "position_among_competitors": 1,
        "reasoning": "Test",
        "sentiment": "neutral",
        "competitor_names_found": [],
        "cited_domains": [],
        "cited_domain_types": []
      }`;

      assert.throws(
        () => parseExtractionResponse(raw, rawAnswer),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("accepts brand_mentioned false with position null", () => {
      const raw = `{
        "brand_mentioned": false,
        "brand_mention_evidence": null,
        "position_among_competitors": null,
        "reasoning": "Brand not mentioned.",
        "sentiment": "neutral",
        "competitor_names_found": [],
        "cited_domains": [],
        "cited_domain_types": []
      }`;

      const result = parseExtractionResponse(raw, rawAnswer);
      assert.equal(result.brand_mentioned, false);
      assert.equal(result.brand_mention_evidence, null);
      assert.equal(result.position_among_competitors, null);
    });

    it("validates sentiment enum", () => {
      const raw = `{
        "brand_mentioned": true,
        "brand_mention_evidence": "Acme Corp",
        "position_among_competitors": 1,
        "reasoning": "Test",
        "sentiment": "invalid_sentiment",
        "competitor_names_found": [],
        "cited_domains": [],
        "cited_domain_types": []
      }`;

      assert.throws(
        () => parseExtractionResponse(raw, rawAnswer),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("validates domain type enum", () => {
      const raw = `{
        "brand_mentioned": true,
        "brand_mention_evidence": "Acme Corp",
        "position_among_competitors": 1,
        "reasoning": "Test",
        "sentiment": "neutral",
        "competitor_names_found": [],
        "cited_domains": ["example.com"],
        "cited_domain_types": [{"domain": "example.com", "type": "invalid_type"}]
      }`;

      assert.throws(
        () => parseExtractionResponse(raw, rawAnswer),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("throws when brand_mentioned is true but brand_mention_evidence does not appear in rawAnswer", () => {
      const raw = `{
        "brand_mentioned": true,
        "brand_mention_evidence": "Nonexistent Brand",
        "position_among_competitors": 1,
        "reasoning": "Test",
        "sentiment": "neutral",
        "competitor_names_found": [],
        "cited_domains": [],
        "cited_domain_types": []
      }`;

      assert.throws(
        () => parseExtractionResponse(raw, rawAnswer),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("throws when brand_mentioned is true and brand_mention_evidence is null", () => {
      const raw = `{
        "brand_mentioned": true,
        "brand_mention_evidence": null,
        "position_among_competitors": 1,
        "reasoning": "Test",
        "sentiment": "neutral",
        "competitor_names_found": [],
        "cited_domains": [],
        "cited_domain_types": []
      }`;

      assert.throws(
        () => parseExtractionResponse(raw, rawAnswer),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });

    it("throws when brand_mentioned is true and brand_mention_evidence is empty string", () => {
      const raw = `{
        "brand_mentioned": true,
        "brand_mention_evidence": "",
        "position_among_competitors": 1,
        "reasoning": "Test",
        "sentiment": "neutral",
        "competitor_names_found": [],
        "cited_domains": [],
        "cited_domain_types": []
      }`;

      assert.throws(
        () => parseExtractionResponse(raw, rawAnswer),
        (error: Error) =>
          error.name === "AiProviderError" &&
          (error as AiProviderError).code === "malformed_response",
      );
    });
  });

  describe("extractionResultSchema", () => {
    it("validates a complete valid extraction result", () => {
      const valid: ExtractionResult = {
        brand_mentioned: true,
        brand_mention_evidence: "Acme Corp",
        position_among_competitors: 2,
        reasoning: "Acme appears after Globex in the answer.",
        sentiment: "neutral",
        competitor_names_found: ["Globex"],
        cited_domains: ["reddit.com", "example.com"],
        cited_domain_types: [
          { domain: "reddit.com", type: "forum" },
          { domain: "example.com", type: "review_site" },
        ],
      };

      const result = extractionResultSchema.safeParse(valid);
      assert.equal(result.success, true);
    });

    it("rejects brand_mentioned false with non-null position", () => {
      const invalid = {
        brand_mentioned: false,
        brand_mention_evidence: null,
        position_among_competitors: 1,
        reasoning: "Test",
        sentiment: "neutral" as const,
        competitor_names_found: [],
        cited_domains: [],
        cited_domain_types: [],
      };

      const result = extractionResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues[0].path.includes("position_among_competitors"));
      }
    });

    it("rejects empty reasoning string", () => {
      const invalid = {
        brand_mentioned: true,
        brand_mention_evidence: "Acme Corp",
        position_among_competitors: 1,
        reasoning: "",
        sentiment: "neutral" as const,
        competitor_names_found: [],
        cited_domains: [],
        cited_domain_types: [],
      };

      const result = extractionResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("rejects reasoning over 2000 chars", () => {
      const invalid = {
        brand_mentioned: true,
        brand_mention_evidence: "Acme Corp",
        position_among_competitors: 1,
        reasoning: "x".repeat(2001),
        sentiment: "neutral" as const,
        competitor_names_found: [],
        cited_domains: [],
        cited_domain_types: [],
      };

      const result = extractionResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
    });

    it("rejects brand_mentioned true with null brand_mention_evidence", () => {
      const invalid = {
        brand_mentioned: true,
        brand_mention_evidence: null,
        position_among_competitors: 1,
        reasoning: "Test",
        sentiment: "neutral" as const,
        competitor_names_found: [],
        cited_domains: [],
        cited_domain_types: [],
      };

      const result = extractionResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues[0].path.includes("brand_mention_evidence"));
      }
    });

    it("rejects brand_mentioned true with empty brand_mention_evidence", () => {
      const invalid = {
        brand_mentioned: true,
        brand_mention_evidence: "",
        position_among_competitors: 1,
        reasoning: "Test",
        sentiment: "neutral" as const,
        competitor_names_found: [],
        cited_domains: [],
        cited_domain_types: [],
      };

      const result = extractionResultSchema.safeParse(invalid);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues[0].path.includes("brand_mention_evidence"));
      }
    });

    it("accepts all valid domain types", () => {
      const validTypes = [
        "review_site",
        "comparison_page",
        "forum",
        "documentation",
        "other",
      ] as const;

      for (const type of validTypes) {
        const valid = {
          brand_mentioned: true,
          brand_mention_evidence: "Acme Corp",
          position_among_competitors: 1,
          reasoning: "Test",
          sentiment: "neutral" as const,
          competitor_names_found: [],
          cited_domains: ["example.com"],
          cited_domain_types: [{ domain: "example.com", type }],
        };

        const result = extractionResultSchema.safeParse(valid);
        assert.equal(result.success, true);
      }
    });
  });
});
