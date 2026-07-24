import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createBrandSchema,
  promptSuggestionRequestSchema,
  promptSuggestionResponseSchema,
  PROMPT_LIMIT_BY_PLAN_TIER,
} from "../../src/modules/brand-config/schemas.ts";

describe("PROMPT_LIMIT_BY_PLAN_TIER", () => {
  it("matches the limits documented in migration 0005's trigger", () => {
    // Kept in sync manually — see the doc-comment on this constant in
    // schemas.ts and the DB trigger in
    // app/supabase/migrations/0005_brand_prompt_configuration.sql. This
    // test exists so a future edit to one side without the other fails
    // loudly instead of silently drifting.
    assert.deepEqual(PROMPT_LIMIT_BY_PLAN_TIER, {
      free: 10,
      starter: 25,
      growth: 75,
      agency: 200,
    });
  });
});

describe("createBrandSchema", () => {
  it("accepts a valid Free-plan payload at exactly the limit", () => {
    const schema = createBrandSchema("free");
    const result = schema.safeParse({
      name: "Acme CRM",
      website: "https://acme.com",
      competitorNames: ["Rival A", "Rival B"],
      promptTexts: Array.from({ length: 10 }, (_, i) => `prompt ${i}`),
      promptsAiSuggested: true,
    });
    assert.equal(result.success, true);
  });

  it("rejects a Free-plan payload one over the limit", () => {
    const schema = createBrandSchema("free");
    const result = schema.safeParse({
      name: "Acme CRM",
      competitorNames: [],
      promptTexts: Array.from({ length: 11 }, (_, i) => `prompt ${i}`),
      promptsAiSuggested: true,
    });
    assert.equal(result.success, false);
  });

  it("allows the Starter plan's higher ceiling that would fail on Free", () => {
    const schema = createBrandSchema("starter");
    const result = schema.safeParse({
      name: "Acme CRM",
      competitorNames: [],
      promptTexts: Array.from({ length: 20 }, (_, i) => `prompt ${i}`),
      promptsAiSuggested: false,
    });
    assert.equal(result.success, true);
  });

  it("rejects an empty brand name", () => {
    const schema = createBrandSchema("free");
    const result = schema.safeParse({
      name: "   ",
      competitorNames: [],
      promptTexts: ["one prompt"],
      promptsAiSuggested: true,
    });
    assert.equal(result.success, false);
  });

  it("rejects a website without a scheme", () => {
    const schema = createBrandSchema("free");
    const result = schema.safeParse({
      name: "Acme",
      website: "acme.com",
      competitorNames: [],
      promptTexts: ["one prompt"],
      promptsAiSuggested: true,
    });
    assert.equal(result.success, false);
  });

  it("treats an empty-string website as absent rather than invalid", () => {
    const schema = createBrandSchema("free");
    const result = schema.safeParse({
      name: "Acme",
      website: "",
      competitorNames: [],
      promptTexts: ["one prompt"],
      promptsAiSuggested: true,
    });
    assert.equal(result.success, true);
  });

  it("rejects more than 20 competitors", () => {
    const schema = createBrandSchema("agency");
    const result = schema.safeParse({
      name: "Acme",
      competitorNames: Array.from({ length: 21 }, (_, i) => `Competitor ${i}`),
      promptTexts: ["one prompt"],
      promptsAiSuggested: true,
    });
    assert.equal(result.success, false);
  });

  it("requires at least one prompt", () => {
    const schema = createBrandSchema("free");
    const result = schema.safeParse({
      name: "Acme",
      competitorNames: [],
      promptTexts: [],
      promptsAiSuggested: true,
    });
    assert.equal(result.success, false);
  });
});

describe("promptSuggestionRequestSchema", () => {
  it("accepts a brand name with no website", () => {
    const result = promptSuggestionRequestSchema.safeParse({ brandName: "Acme" });
    assert.equal(result.success, true);
  });

  it("rejects an empty brand name", () => {
    const result = promptSuggestionRequestSchema.safeParse({ brandName: "" });
    assert.equal(result.success, false);
  });
});

describe("promptSuggestionResponseSchema", () => {
  it("accepts a well-formed Gemini response shape", () => {
    const result = promptSuggestionResponseSchema.safeParse({
      prompts: ["best CRM for a small agency", "CRM with the best onboarding"],
    });
    assert.equal(result.success, true);
  });

  it("rejects a response with no prompts key (e.g. a malformed/off-spec model reply)", () => {
    const result = promptSuggestionResponseSchema.safeParse({ suggestions: ["x"] });
    assert.equal(result.success, false);
  });

  it("rejects a response with more than 30 prompts", () => {
    const result = promptSuggestionResponseSchema.safeParse({
      prompts: Array.from({ length: 31 }, (_, i) => `prompt ${i}`),
    });
    assert.equal(result.success, false);
  });
});
