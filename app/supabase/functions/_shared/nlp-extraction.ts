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
    position_among_competitors: z.number().int().positive().nullable(),
    reasoning: z.string().trim().min(1).max(2000),
    sentiment: z.enum(["positive", "neutral", "negative"]),
    competitor_names_found: z.array(z.string().trim().min(1).max(200)).max(50),
    cited_domains: z.array(z.string().trim().min(1).max(255)).max(50),
    cited_domain_types: z.array(citedDomainSchema).max(50),
  })
  .refine((v) => v.brand_mentioned || v.position_among_competitors === null, {
    message: "position_among_competitors must be null when brand_mentioned is false",
    path: ["position_among_competitors"],
  });

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
  "position_among_competitors": integer or null (null if brand_mentioned is false; otherwise this brand's rank by order of first appearance among ALL brand/competitor names mentioned in the answer -- 1 means mentioned first),
  "reasoning": string (1-3 sentences on why the AI cited what it cited, grounded in the actual answer text below -- do not invent reasoning not supported by the text),
  "sentiment": "positive" | "neutral" | "negative" (tone toward this brand specifically, not the answer as a whole),
  "competitor_names_found": string[] (any of the listed competitor names below that also appear in the answer, using the exact names given),
  "cited_domains": string[] (bare domains, e.g. "reddit.com", drawn from the cited sources list below and/or from any URLs or domains mentioned in the answer text itself),
  "cited_domain_types": [{"domain": string, "type": "review_site"|"comparison_page"|"forum"|"documentation"|"other"}] (one entry per domain in cited_domains, classified by page type; use "other" if none of the four specific types fit)
}

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

export function parseExtractionResponse(rawModelText: string): ExtractionResult {
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
  return validated.data;
}
