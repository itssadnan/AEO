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
