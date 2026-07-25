import type { GroundingCitation } from "@/lib/ai-providers/schemas";

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
