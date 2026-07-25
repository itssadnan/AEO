// Deno-side twin of src/modules/nlp-extraction/{schemas,prompt,parse-extraction-response}.ts
// See the duplication note in _shared/key-pool.ts for why this can't just be
// imported from the app side. zod is fetched from esm.sh since Deno Edge
// Functions use URL imports, not npm's node_modules resolution.
import { z } from "https://esm.sh/zod@3";

export const DOMAIN_TYPES = [
  "review_site",
  "comparison_page",
  "forum",
  "documentation",
  "other",
] as const;
export type DomainType = (typeof DOMAIN_TYPES)[number];

export const citedDomainSchema = z.object({
  domain: z.string().trim().min(1).max(255),
  type: z.enum(DOMAIN_TYPES),
});

export const extractionResultSchema = z
  .object({
    brand_mentioned: z.boolean(),
    // NEW: forces the model to point at real text rather than asserting a bare
    // boolean. parseExtractionResponse (below) mechanically verifies this string
    // is an actual substring of the raw answer -- a hallucinated or missing quote
    // fails validation and the job goes to retry/fail, rather than writing a
    // wrong result. Added 2026-07-25 after a live smoke test proved this model
    // class sets brand_mentioned: true without the brand name actually appearing
    // in the text -- see progress/modules/5.4-nlp-extraction-and-structuring.md
    // decisions log for the full finding.
    brand_mention_evidence: z.string().trim().max(500).nullable(),
    position_among_competitors: z.number().int().positive().nullable(),
    reasoning: z.string().trim().min(1).max(2000),
    sentiment: z.enum(["positive", "neutral", "negative"]),
    competitor_names_found: z.array(z.string().trim().min(1).max(200)).max(50),
    cited_domains: z.array(z.string().trim().min(1).max(255)).max(50),
    cited_domain_types: z.array(citedDomainSchema).max(50),
  })
  .refine(
    (v: { brand_mentioned: boolean; position_among_competitors: number | null }) =>
      v.brand_mentioned || v.position_among_competitors === null,
    {
      message: "position_among_competitors must be null when brand_mentioned is false",
      path: ["position_among_competitors"],
    },
  )
  .refine(
    (v) =>
      !v.brand_mentioned ||
      (v.brand_mention_evidence !== null && v.brand_mention_evidence.length > 0),
    {
      message: "brand_mention_evidence is required and non-empty when brand_mentioned is true",
      path: ["brand_mention_evidence"],
    },
  );

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const groundingCitationSchema = z.object({
  uri: z.string().url(),
  title: z.string().trim().max(500).optional(),
});
export type GroundingCitation = z.infer<typeof groundingCitationSchema>;

export function buildExtractionPrompt(input: {
  rawAnswer: string;
  brandName: string;
  competitorNames: string[];
  citations: GroundingCitation[];
}): string {
  const citationLines = input.citations.length
    ? input.citations.map((c) => `- ${c.uri}${c.title ? ` ("${c.title}")` : ""}`).join("\n")
    : "(none provided)";
  return `You are extracting structured data from an AI answer engine's response about a brand. Return ONLY a single JSON object -- no prose before or after it, no markdown code fence -- matching exactly this shape:

{
  "brand_mentioned": boolean,
  "brand_mention_evidence": string or null (REQUIRED when brand_mentioned is true: the exact, verbatim substring of the AI ANSWER TO ANALYZE below where the brand is named -- copy it character-for-character from the text, do not paraphrase or summarize it. null when brand_mentioned is false.),
  "position_among_competitors": integer or null (null if brand_mentioned is false; otherwise this brand's rank by order of first appearance among ALL brand/competitor names mentioned in the answer -- 1 means mentioned first),
  "reasoning": string (1-3 sentences on why the AI cited what it cited, grounded in the actual answer text below -- do not invent reasoning not supported by the text),
  "sentiment": "positive" | "neutral" | "negative" (tone toward this brand specifically, not the answer as a whole),
  "competitor_names_found": string[] (any of the listed competitor names below that also appear in the answer, using the exact names given),
  "cited_domains": string[] (bare domains, e.g. "reddit.com", drawn from the cited sources list below and/or from any URLs or domains mentioned in the answer text itself),
  "cited_domain_types": [{"domain": string, "type": "review_site"|"comparison_page"|"forum"|"documentation"|"other"}] (one entry per domain in cited_domains, classified by page type; use "other" if none of the four specific types fit)
}

STRICT RULES (read carefully -- these override any instinct to guess):
1. Set "brand_mentioned" to true ONLY if the exact brand name "${input.brandName}" (or an unambiguous variant of it -- different capitalization, or with/without a trailing "Inc."/"Corp"/"LLC") literally appears somewhere in the AI ANSWER TO ANALYZE text below. If it does not appear, "brand_mentioned" MUST be false and "brand_mention_evidence" and "position_among_competitors" MUST both be null -- even if some other company is discussed prominently in the text. Do not treat the most prominent company mentioned as if it were the brand.
2. "competitor_names_found" MUST be a subset of exactly the names listed in COMPETITORS below, copied with the exact spelling given. Never include a company name that appears in the answer text but was NOT in the COMPETITORS list, and never include the brand's own name in this list.
3. If COMPETITORS below is "(none listed)", "competitor_names_found" MUST be an empty array [], regardless of what other company names appear in the answer text.

BRAND: ${input.brandName}
COMPETITORS (named by the customer, not exhaustive): ${input.competitorNames.length ? input.competitorNames.join(", ") : "(none listed)"}

AI ANSWER TO ANALYZE:
"""
${input.rawAnswer}
"""

CITED SOURCES (from the grounding call, if any):
${citationLines}`;
}

export class AiProviderError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AiProviderError";
  }
}

export function parseExtractionResponse(rawModelText: string, rawAnswer: string): ExtractionResult {
  const stripped = rawModelText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new AiProviderError("malformed_response");
  }
  const validated = extractionResultSchema.safeParse(parsed);
  if (!validated.success) throw new AiProviderError("malformed_response");

  const result = validated.data;
  // Mechanical grounding check: if the model claims the brand was mentioned, its
  // own quoted evidence must actually appear in the real answer text -- not just
  // be present as a field (the schema already checked that), but be REAL. A model
  // that hallucinates brand_mentioned: true with a fabricated or empty quote is
  // caught here and the job is treated as a malformed response (goes to
  // retry/fail), rather than writing an unverified result to the database.
  if (result.brand_mentioned) {
    const evidence = result.brand_mention_evidence?.trim().toLowerCase() ?? "";
    if (!evidence || !rawAnswer.toLowerCase().includes(evidence)) {
      throw new AiProviderError("malformed_response");
    }
  }

  return result;
}
