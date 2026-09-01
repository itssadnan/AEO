/**
 * Explanation Engine / Opportunity Finder shaping — Module 5.6.
 *
 * Deliberately kept in its own file with zero runtime dependencies (no
 * Supabase client, no Next.js APIs) so it can be unit tested in a plain
 * Node process without dragging in server-only/next-runtime imports — same
 * reasoning as plan-tier.ts, see tests/unit/dashboard.test.ts.
 *
 * Turns one visibility_snapshots row (migration 0016 — see that file's
 * doc-comments for the full column-by-column reasoning) into the flat shape
 * the view renders. All the jsonb columns here are typed `Json` (unknown
 * shape) at the TS level even though this module fully controls what SQL
 * writes into them, so every read below is defensive rather than a blind
 * cast — a row written by an older/newer migration should degrade to "no
 * data for this field", never throw.
 */

import type { VisibilitySnapshotRow } from "./database-extensions";
import type {
  CitationProfileEntry,
  ExplanationEngineData,
  ExplanationEngineStatus,
  OpportunityGap,
  RecommendedAction,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Shared by source_influence ({domain_type,citation_count,pct}) and explanation_breakdown.breakdown ({domain_type,pct}) — both reduce to the same {domainType, pct} the view needs. */
function parseCitationProfile(value: unknown): CitationProfileEntry[] {
  return asArray(value).flatMap((entry) => {
    const row = asRecord(entry);
    const domainType = row && asString(row.domain_type);
    const pct = row && asNumber(row.pct);
    return domainType !== null && pct !== null ? [{ domainType, pct }] : [];
  });
}

function parseOpportunityGaps(value: unknown): OpportunityGap[] {
  return asArray(value).flatMap((entry) => {
    const row = asRecord(entry);
    if (!row) return [];
    const domainType = asString(row.domain_type);
    const competitorCitationCount = asNumber(row.competitor_citation_count);
    const competitorPct = asNumber(row.competitor_pct);
    const brandCitationCount = asNumber(row.brand_citation_count);
    if (
      domainType === null ||
      competitorCitationCount === null ||
      competitorPct === null ||
      brandCitationCount === null
    ) {
      return [];
    }
    return [{ domainType, competitorCitationCount, competitorPct, brandCitationCount }];
  });
}

function parseRecommendedActions(value: unknown): RecommendedAction[] {
  return asArray(value).flatMap((entry) => {
    const row = asRecord(entry);
    if (!row) return [];
    const action = asString(row.action);
    const rationale = asString(row.rationale);
    const confidence = row.confidence;
    if (
      action === null ||
      rationale === null ||
      (confidence !== "high" && confidence !== "medium" && confidence !== "low")
    ) {
      return [];
    }
    return [{ action, confidence, rationale }];
  });
}

export function shapeExplanationEngineData(
  snapshot: VisibilitySnapshotRow | null,
): ExplanationEngineData {
  const empty: ExplanationEngineData = {
    status: "no_data",
    competitorName: null,
    brandMentionCount: null,
    competitorMentionCount: null,
    citationRatio: null,
    brandCitationProfile: [],
    competitorCitationProfile: [],
    opportunityGaps: [],
    explanationText: null,
    recommendedActions: [],
    attempts: 0,
    lastErrorCode: null,
    explanationProvider: null,
    explanationModel: null,
    generatedAt: null,
  };

  if (!snapshot) return empty;

  let status: ExplanationEngineStatus;
  if (snapshot.explanation_skip_reason === "free_plan") {
    status = "free_plan";
  } else if (snapshot.explanation_skip_reason === "no_competitor_ahead") {
    status = "no_competitor_ahead";
  } else if (snapshot.status === "completed") {
    status = "completed";
  } else if (snapshot.status === "failed") {
    status = "failed";
  } else if (
    snapshot.status === "queued" ||
    snapshot.status === "processing" ||
    snapshot.status === "retry"
  ) {
    status = "pending";
  } else {
    // Defensive: 'not_applicable' with no skip_reason isn't a real combination
    // per the DB check constraint, but degrade to "no_data" rather than guess.
    status = "no_data";
  }

  const breakdown = asRecord(snapshot.explanation_breakdown);
  const shareOfVoice = asRecord(snapshot.share_of_voice);
  const brandShare = shareOfVoice && asRecord(shareOfVoice.brand);
  const competitorsShare = shareOfVoice ? asArray(shareOfVoice.competitors) : [];
  const topCompetitorShare = asRecord(competitorsShare[0]);

  return {
    status,
    // explanation_breakdown.competitor_name is set only once the row reaches
    // the paid+behind branch; share_of_voice's top competitor is always
    // there once any competitor has been mentioned at all, so it's a useful
    // fallback for a "no_competitor_ahead" row that still had some mentions.
    competitorName:
      (breakdown && asString(breakdown.competitor_name)) ||
      (topCompetitorShare && asString(topCompetitorShare.name)),
    brandMentionCount: brandShare && asNumber(brandShare.mention_count),
    competitorMentionCount: topCompetitorShare && asNumber(topCompetitorShare.mention_count),
    citationRatio: breakdown && asNumber(breakdown.citation_ratio),
    brandCitationProfile: parseCitationProfile(snapshot.source_influence),
    competitorCitationProfile: breakdown ? parseCitationProfile(breakdown.breakdown) : [],
    opportunityGaps: parseOpportunityGaps(snapshot.opportunity_gaps),
    explanationText: breakdown && asString(breakdown.explanation_text),
    recommendedActions: parseRecommendedActions(snapshot.recommended_actions),
    attempts: snapshot.attempts,
    lastErrorCode: snapshot.last_error_code,
    explanationProvider: snapshot.explanation_provider,
    explanationModel: snapshot.explanation_model,
    generatedAt: snapshot.generated_at,
  };
}
