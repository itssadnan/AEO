import { z } from "zod";

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
  .refine((v) => v.brand_mentioned || v.position_among_competitors === null, {
    message: "position_among_competitors must be null when brand_mentioned is false",
    path: ["position_among_competitors"],
  })
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
