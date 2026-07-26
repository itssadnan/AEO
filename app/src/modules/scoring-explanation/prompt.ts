/**
 * Builds the prompt for the NVIDIA NIM explanation engine.
 *
 * Design note (finalized 2026-07-26, see progress/modules/5.5-*.md decisions
 * log): every number in this prompt -- including `citationRatio` -- is
 * computed once, by SQL, before this function ever runs. The model is never
 * asked to divide, count, or compare a number against a threshold, because
 * Module 5.4's live smoke test (2026-07-25) proved this model class doesn't
 * reliably get that class of task right even when explicitly instructed.
 * That's also why `confidence` below is graded on a qualitative, categorical
 * rule (does a listed zero-presence gap support this action, yes/no) instead
 * of a numeric percentage threshold -- a threshold comparison is exactly the
 * kind of judgment this model class has already been shown to fail at.
 *
 * `citationRatio` is sourced from claim_visibility_explanation_jobs()'s
 * `citation_ratio` column, itself read from `explanation_breakdown` (computed
 * once in run_visibility_scoring_cycle()) -- never re-derived here or in the
 * caller via division, so there is exactly one source of truth for this
 * number, not two slightly-different copies.
 */
export function buildExplanationPrompt(input: {
  brandName: string;
  competitorName: string;
  brandMentionCount: number;
  competitorMentionCount: number;
  /** Precomputed by SQL (rounded to 1 decimal) -- do not recalculate. */
  citationRatio: number;
  brandCitationProfile: { domain_type: string; pct: number }[];
  competitorCitationProfile: { domain_type: string; pct: number }[];
  opportunityGaps: {
    domain_type: string;
    competitor_citation_count: number;
    competitor_pct: number;
    brand_citation_count: number;
  }[];
}): string {
  const fmtProfile = (profile: { domain_type: string; pct: number }[], label: string) =>
    profile.length
      ? profile.map((x) => `- ${x.domain_type}: ${x.pct}% of ${label}'s citations`).join("\n")
      : "(no citation data)";

  const fmtGaps = (gaps: typeof input.opportunityGaps) =>
    gaps.length
      ? gaps
          .map(
            (g) =>
              `- ${g.domain_type}: ${input.competitorName} has ${g.competitor_citation_count} citations there (${g.competitor_pct}% of its total citations); ${input.brandName} has zero`,
          )
          .join("\n")
      : "(no zero-presence gaps found)";

  return `You are writing a short, plain-English explanation for a marketing customer about why a named competitor is being cited more often than their brand by an AI answer engine. All the numbers below are already computed and correct -- do not recalculate, restate differently, or invent any number. Your only job is prose and judgment calls.

Return ONLY a single JSON object -- no prose before or after it, no markdown code fence -- matching exactly this shape:

{
  "explanation_text": string (1-4 sentences, max 1000 chars, grounded only in the numbers given below -- do not invent causes not supported by this data),
  "recommended_actions": [
    { "action": string (max 300 chars, concrete and specific, e.g. "Publish a comparison page against ${input.competitorName}"), "confidence": "high" | "medium" | "low", "rationale": string (max 500 chars, one sentence tying this action to the specific gap data below) }
  ] (1-10 items, ranked most impactful first)
}

STRICT RULES:
1. explanation_text must be 1-4 sentences, grounded ONLY in the numbers below. Do not invent facts not in the data.
2. Every recommended_actions item must reference a specific fact from the data below (a mention count, a citation percentage, or a named domain-type gap) -- never a generic claim.
3. Confidence is a judgment call, not a calculation: "high" only when a zero-presence gap listed in OPPORTUNITY GAPS below directly motivates the action, "medium" when it's a reasonable inference from the citation profiles even without a listed gap, "low" when it's a general best practice not directly evidenced by the numbers above. Do not grade confidence by comparing any percentage to a threshold yourself.
4. Never recommend "improve SEO" or "create more content" generically -- name the specific domain_type and the competitor's advantage on it.
5. If OPPORTUNITY GAPS is empty, still produce at least one action, focused on the brand's weakest cited domain_type, and grade it "low" or "medium" per rule 3 (never "high" without a listed gap).

BRAND: ${input.brandName} (mentioned in ${input.brandMentionCount} tracked checks this period)
COMPETITOR: ${input.competitorName} (mentioned in ${input.competitorMentionCount} tracked checks this period -- ${input.citationRatio}x more than the brand)

BRAND's citation-type profile:
${fmtProfile(input.brandCitationProfile, "the brand")}

${input.competitorName.toUpperCase()}'s citation-type profile:
${fmtProfile(input.competitorCitationProfile, input.competitorName)}

OPPORTUNITY GAPS (domain types the competitor is cited on where the brand has zero citations at all):
${fmtGaps(input.opportunityGaps)}`;
}
