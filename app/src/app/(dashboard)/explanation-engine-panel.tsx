"use client";

import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { LockedPanel } from "@/components/ui/locked-panel";
import { formatRelativeTime } from "@/lib/utils";
import type {
  CitationProfileEntry,
  ExplanationEngineData,
  RecommendedAction,
} from "@/modules/dashboard/types";

const CONFIDENCE_TONE: Record<RecommendedAction["confidence"], BadgeTone> = {
  high: "positive",
  medium: "warning",
  low: "neutral",
};

/** "review_site" -> "Review Site". The taxonomy itself lives in one place
 * only (nlp-extraction/schemas.ts's DOMAIN_TYPES) -- this just formats
 * whatever string it's given, it never hardcodes the list of values. */
function formatDomainType(domainType: string): string {
  return domainType
    .split("_")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function CitationProfileBars({
  title,
  profile,
}: {
  title: string;
  profile: CitationProfileEntry[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-text-tertiary">{title}</p>
      {profile.length === 0 ? (
        <p className="text-sm text-text-tertiary">No citation data yet.</p>
      ) : (
        <div className="space-y-1.5">
          {profile.map((entry) => (
            <div key={entry.domainType} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-xs text-text-secondary">
                {formatDomainType(entry.domainType)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(entry.pct, 100)}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-text-primary">
                {entry.pct}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PANEL_TITLE = "Explanation Engine & Opportunity Finder";
const PANEL_SUBTITLE =
  "Why a competitor is being cited more often by AI answer engines, and concrete actions to close the gap.";

const EXAMPLE_BRAND_PROFILE: CitationProfileEntry[] = [
  { domainType: "review_site", pct: 45 },
  { domainType: "documentation", pct: 35 },
  { domainType: "forum", pct: 20 },
];
const EXAMPLE_COMPETITOR_PROFILE: CitationProfileEntry[] = [
  { domainType: "comparison_page", pct: 50 },
  { domainType: "review_site", pct: 30 },
  { domainType: "other", pct: 20 },
];

/**
 * Surfaces Module 5.5's Explanation Engine / Opportunity Finder backend
 * (visibility_snapshots.explanation_breakdown / opportunity_gaps /
 * recommended_actions) -- computed since that module shipped, never
 * rendered anywhere until now (see competitor-explorer-view.tsx's former
 * top-of-file comment, and progress/modules/5.6-dashboard-frontend.md's
 * acceptance criterion this fulfils: "Share-of-Voice always shown;
 * Explanation Engine + Opportunity Finder panels render as a visible
 * locked/upsell state for Free-plan workspaces (never silently omitted),
 * full panels for paid").
 *
 * Every branch below reflects a real, DB-computed state -- there is no
 * "fake" locked state here the way there was in the "Pro"-tier copy removed
 * elsewhere in this module: explanation_skip_reason='free_plan' is set by
 * run_visibility_scoring_cycle() itself, so Free-plan rows never even queue
 * the NVIDIA NIM call.
 */
export function ExplanationEnginePanel({ data }: { data: ExplanationEngineData }) {
  if (data.status === "no_data") {
    return (
      <Card>
        <h2 className="text-lg font-medium text-text-primary">{PANEL_TITLE}</h2>
        <p className="mt-2 text-sm text-text-tertiary">
          Not enough data yet — run a visibility check to see why competitors are cited more often
          and what to do about it.
        </p>
      </Card>
    );
  }

  if (data.status === "free_plan") {
    return (
      <Card>
        <LockedPanel
          isLocked
          lockMessage={`${PANEL_TITLE} — plain-English analysis of why a competitor is winning, plus ranked recommended actions — is available on paid plans.`}
          ctaLabel="Upgrade"
          ctaHref="/settings?tab=billing"
        >
          <div>
            <h2 className="mb-1 text-lg font-medium text-text-primary">{PANEL_TITLE}</h2>
            <p className="mb-4 text-sm text-text-secondary">{PANEL_SUBTITLE}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <CitationProfileBars title="Your citation mix" profile={EXAMPLE_BRAND_PROFILE} />
              <CitationProfileBars
                title="Example competitor citation mix"
                profile={EXAMPLE_COMPETITOR_PROFILE}
              />
            </div>
          </div>
        </LockedPanel>
      </Card>
    );
  }

  const statusBadge =
    data.status === "completed" ? (
      <Badge tone="positive">Ready</Badge>
    ) : data.status === "pending" ? (
      <Badge tone="warning">Generating…</Badge>
    ) : data.status === "failed" ? (
      <Badge tone="negative">Unavailable</Badge>
    ) : (
      <Badge tone="positive">You&apos;re ahead</Badge>
    );

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-text-primary">{PANEL_TITLE}</h2>
        {statusBadge}
      </div>

      {data.status === "no_competitor_ahead" ? (
        <>
          <p className="mb-4 text-sm text-text-secondary">
            No tracked competitor currently has more AI mentions than you this period — there is
            nothing to explain right now.
          </p>
          <CitationProfileBars title="Your citation mix" profile={data.brandCitationProfile} />
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-text-secondary">
            {data.competitorName ? (
              <>
                <span className="font-medium text-text-primary">{data.competitorName}</span> is
                mentioned {data.competitorMentionCount ?? "—"} times vs. your{" "}
                {data.brandMentionCount ?? "—"} this period
                {data.citationRatio ? ` (${data.citationRatio}x more often)` : ""}.
              </>
            ) : (
              "A tracked competitor currently has more AI mentions than you this period."
            )}
          </p>

          {data.status === "completed" && data.explanationText && (
            <div className="mb-5 rounded-lg border border-border bg-surface-2/50 p-4">
              <p className="text-sm text-text-primary">{data.explanationText}</p>
              {(data.explanationProvider || data.generatedAt) && (
                <p className="mt-2 text-xs text-text-tertiary">
                  {data.explanationProvider
                    ? `Generated via ${data.explanationProvider}${data.explanationModel ? ` (${data.explanationModel})` : ""}`
                    : "Generated"}
                  {data.generatedAt ? ` • ${formatRelativeTime(data.generatedAt)}` : ""}
                </p>
              )}
            </div>
          )}

          {data.status === "pending" && (
            <div
              className="mb-5 flex items-center gap-3 rounded-lg border border-dashed border-border p-4"
              aria-busy="true"
              aria-live="polite"
            >
              <span
                className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--color-warning)]"
                aria-hidden="true"
              />
              <p className="text-sm text-text-secondary">
                AI-written explanation and recommended actions are still generating
                {data.attempts > 1 ? ` (attempt ${data.attempts})` : ""}
                {data.lastErrorCode === "rate_limited"
                  ? " — the AI provider is currently rate-limited, this will retry automatically"
                  : ""}
                . The analysis below is already accurate.
              </p>
            </div>
          )}

          {data.status === "failed" && (
            <div className="mb-5 rounded-lg border border-border bg-negative-muted p-4">
              <p className="text-sm text-negative">
                AI-written explanation and recommended actions failed after {data.attempts} attempt
                {data.attempts === 1 ? "" : "s"}
                {data.lastErrorCode ? ` (${data.lastErrorCode})` : ""}. The numeric analysis below
                is still accurate.
              </p>
            </div>
          )}

          {data.recommendedActions.length > 0 && (
            <div className="mb-5">
              <h3 className="mb-2 text-sm font-semibold text-text-secondary">
                Recommended actions
              </h3>
              <ol className="space-y-3">
                {data.recommendedActions.map((action, i) => (
                  <li key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-text-primary">{action.action}</p>
                      <Badge tone={CONFIDENCE_TONE[action.confidence]}>{action.confidence}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">{action.rationale}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {data.opportunityGaps.length > 0 && (
            <div className="mb-5">
              <h3 className="mb-2 text-sm font-semibold text-text-secondary">Opportunity gaps</h3>
              <p className="mb-2 text-xs text-text-tertiary">
                Citation types {data.competitorName ?? "your competitor"} gets cited on where you
                currently have zero presence.
              </p>
              <div className="space-y-1.5">
                {data.opportunityGaps.map((gap) => (
                  <div
                    key={gap.domainType}
                    className="flex items-center justify-between rounded-lg bg-surface-2/50 px-3 py-2 text-sm"
                  >
                    <span className="text-text-primary">{formatDomainType(gap.domainType)}</span>
                    <span className="font-mono text-xs tabular-nums text-text-secondary">
                      {data.competitorName ?? "Competitor"}: {gap.competitorCitationCount} (
                      {gap.competitorPct}%) • You: 0
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <CitationProfileBars title="Your citation mix" profile={data.brandCitationProfile} />
            <CitationProfileBars
              title={
                data.competitorName
                  ? `${data.competitorName}'s citation mix`
                  : "Competitor citation mix"
              }
              profile={data.competitorCitationProfile}
            />
          </div>
        </>
      )}
    </Card>
  );
}
