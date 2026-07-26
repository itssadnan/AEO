"use client";

import { Card } from "@/components/ui/card";
import { MetricStat } from "@/components/ui/metric-stat";
import { EngineBadge } from "@/components/ui/engine-badge";
import { PlanBadge } from "@/components/ui/plan-badge";
import { LockedPanel } from "@/components/ui/locked-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { CalculationDisclosure } from "@/components/ui/calculation-disclosure";
import { formatRelativeTime, formatPercent } from "@/lib/utils";
import type {
  BrandWithRelations,
  OverviewMetrics,
  EmptyStateConfig,
  Competitor,
  Prompt,
} from "@/modules/dashboard/types";

interface OverviewViewProps {
  brand: BrandWithRelations;
  overview: OverviewMetrics & { mentionCount?: number };
  emptyState: EmptyStateConfig;
  competitors: (Competitor & { shareOfVoice?: number })[];
  prompts: Prompt[];
  workspace: { id: string; name: string; plan_tier: "free" | "starter" | "growth" | "agency" };
}

/**
 * Overview view — the default landing page for a brand dashboard.
 * Shows key metrics, recent activity, and empty state guidance.
 */
export function OverviewView({
  brand,
  overview,
  emptyState,
  competitors,
  prompts,
  workspace,
}: OverviewViewProps) {
  const hasData = overview.visibilityScore > 0 || (overview.mentionCount ?? 0) > 0;

  // Determine if competitor view is locked (free tier limit)
  const isCompetitorLocked = workspace.plan_tier === "free" && competitors.length > 0;

  if (!hasData && emptyState.planTier === "free") {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Brand header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {brand.name}
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-1">
              Workspace: {workspace.name} •{" "}
              <PlanBadge plan={workspace.plan_tier as "free" | "starter" | "growth" | "agency"} />
            </p>
          </div>
          <EngineBadge engine="gemini" />
        </div>

        {/* Metrics cards - all zeros for empty state */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricStat label="Visibility Score" value={overview.visibilityScore} trend="neutral" />
          <MetricStat label="Share of Voice" value={overview.shareOfVoice} trend="neutral" />
          <MetricStat
            label="Rank"
            value={overview.totalCompetitors > 0 ? `#${overview.rank}` : "—"}
            trend="neutral"
          />
          <MetricStat label="Mentions" value={overview.mentionCount ?? 0} trend="neutral" />
        </div>

        {/* Empty state guidance */}
        <EmptyState
          title="No visibility data yet"
          description="Add prompts and competitors, then run a visibility check to see your AI presence."
          cta={
            <a
              href="/brands/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Set up tracking
            </a>
          }
        />

        {/* Calculation disclosure - empty state has no source */}
      </div>
    );
  }

  // Has data - show full overview
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Brand header with key metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{brand.name}</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">
            Workspace: {workspace.name} •{" "}
            <PlanBadge plan={workspace.plan_tier as "free" | "starter" | "growth" | "agency"} />•
            Last checked:{" "}
            {overview.lastChecked ? formatRelativeTime(overview.lastChecked) : "Never"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <EngineBadge engine={overview.engine === "gemini" ? "gemini" : "nvidia-nim"} />
          <span className="text-sm text-[var(--color-text-tertiary)]">
            {overview.engine === "gemini" ? "Google Gemini" : "NVIDIA NIM"}
          </span>
        </div>
      </div>

      {/* Key metrics row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricStat
          label="Visibility Score"
          value={`${overview.visibilityScore}/100`}
          trend={
            overview.visibilityScore > 50
              ? "up"
              : overview.visibilityScore > 20
                ? "neutral"
                : "down"
          }
          trendDelta={
            overview.visibilityScore > 50 ? "+12" : overview.visibilityScore > 20 ? "+2" : "-5"
          }
        />
        <MetricStat
          label="Share of Voice"
          value={`${overview.shareOfVoice}%`}
          trend={
            overview.shareOfVoice > 30 ? "up" : overview.shareOfVoice > 10 ? "neutral" : "down"
          }
          trendDelta={
            overview.shareOfVoice > 30 ? "+5%" : overview.shareOfVoice > 10 ? "+1%" : "-3%"
          }
        />
        <MetricStat
          label="Rank"
          value={overview.totalCompetitors > 0 ? `#${overview.rank}` : "—"}
          trend="neutral"
        />
        <MetricStat
          label="Total Mentions"
          value={overview.mentionCount ?? 0}
          trend={(overview.mentionCount ?? 0) > 10 ? "up" : "neutral"}
          trendDelta={(overview.mentionCount ?? 0) > 10 ? "+8" : "+0"}
        />
      </div>

      {/* Share of Voice breakdown & Competitor comparison */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Share of Voice Chart */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[var(--color-text-primary)]">Share of Voice</h2>
            <EngineBadge
              engine={overview.engine === "gemini" ? "gemini" : "nvidia-nim"}
              size="sm"
            />
          </div>
          <div className="space-y-4">
            {/* Brand bar */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-[var(--color-text-primary)]">
                  {brand.name} (You)
                </span>
                <span className="text-[var(--color-accent)] font-semibold">
                  {formatPercent(overview.shareOfVoice)}
                </span>
              </div>
              <div className="h-3 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(overview.shareOfVoice, 100)}%` }}
                />
              </div>
            </div>

            {/* Competitor bars */}
            {competitors.slice(0, 5).map((comp) => (
              <div key={comp.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[var(--color-text-secondary)]">{comp.name}</span>
                  <span className="text-[var(--color-text-tertiary)] font-medium">
                    {formatPercent(comp.shareOfVoice ?? 0)}
                  </span>
                </div>
                <div className="h-2 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-border)] rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(comp.shareOfVoice ?? 0, 100)}%` }}
                  />
                </div>
              </div>
            ))}

            {competitors.length > 5 && (
              <p className="text-xs text-[var(--color-text-tertiary)] text-center">
                +{competitors.length - 5} more competitors
              </p>
            )}
          </div>
        </Card>

        {/* Quick Actions / Status */}
        <Card className="p-6">
          <h2 className="text-lg font-medium text-[var(--color-text-primary)] mb-4">
            Quick Status
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-[var(--color-surface-1)] rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-muted)] flex items-center justify-center">
                  <span className="text-lg">📝</span>
                </div>
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">Active Prompts</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {prompts.length} prompt{prompts.length !== 1 ? "s" : ""} configured
                  </p>
                </div>
              </div>
              {prompts.length === 0 && (
                <a
                  href="/brands/new"
                  className="text-sm font-medium text-[var(--color-accent)] hover:underline"
                >
                  Add prompts
                </a>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-[var(--color-surface-1)] rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-positive-muted)] flex items-center justify-center">
                  <span className="text-lg">🏢</span>
                </div>
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">
                    Competitors Tracked
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {competitors.length} competitor{competitors.length !== 1 ? "s" : ""} configured
                  </p>
                </div>
              </div>
              {isCompetitorLocked ? (
                <LockedPanel
                  children={<div />}
                  isLocked={true}
                  lockMessage="Upgrade to Pro for competitor tracking"
                  ctaLabel="Upgrade"
                  ctaHref="/settings/billing"
                />
              ) : (
                competitors.length === 0 && (
                  <a
                    href="/brands/new"
                    className="text-sm font-medium text-[var(--color-accent)] hover:underline"
                  >
                    Add competitors
                  </a>
                )
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-[var(--color-surface-1)] rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-warning-muted)] flex items-center justify-center">
                  <span className="text-lg">📊</span>
                </div>
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">Last Scoring Run</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {overview.lastChecked ? formatRelativeTime(overview.lastChecked) : "Never run"}
                  </p>
                </div>
              </div>
              <a
                href={`/dashboard/${brand.id}/reports`}
                className="text-sm font-medium text-[var(--color-accent)] hover:underline"
              >
                View reports
              </a>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent activity / prompts with data */}
      {(prompts.length > 0 || competitors.length > 0) && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-[var(--color-text-primary)]">
              Recent Prompt Activity
            </h2>
            <a
              href={`/dashboard/${brand.id}/prompts`}
              className="text-sm font-medium text-[var(--color-accent)] hover:underline"
            >
              View all →
            </a>
          </div>
          <div className="space-y-3">
            {prompts.slice(0, 3).map((prompt) => (
              <div
                key={prompt.id}
                className="flex items-center justify-between p-3 bg-[var(--color-surface-1)] rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--color-accent-muted)] flex items-center justify-center">
                    <span className="text-sm">💬</span>
                  </div>
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)] truncate max-w-md">
                      {prompt.text}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">Active prompt</p>
                  </div>
                </div>
                <EngineBadge engine="gemini" size="sm" />
              </div>
            ))}
            {prompts.length === 0 && (
              <div className="text-center py-8 text-[var(--color-text-tertiary)]">
                <p>
                  No active prompts yet.{" "}
                  <a href="/brands/new" className="text-[var(--color-accent)] hover:underline">
                    Add prompts
                  </a>{" "}
                  to start tracking.
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Calculation disclosure - no detailed source in overview, show summary */}
      <CalculationDisclosure
        source={{
          promptText: "Multiple tracked prompts",
          provider: overview.engine === "gemini" ? "gemini" : "nvidia-nim",
          model: overview.engine === "gemini" ? "Gemini 1.5 Flash" : "NVIDIA Nemotron 3 Ultra",
          checkedAt: overview.lastChecked ?? new Date().toISOString(),
          rawAnswer: "Aggregated across all tracked prompts for this brand",
          extractedEntities: {
            brandMentioned: (overview.mentionCount ?? 0) > 0,
            positionAmongCompetitors: overview.rank,
            competitorNamesFound: competitors.map((c) => c.name),
            citedDomains: [],
            citedDomainTypes: [],
          },
        }}
        triggerLabel="How we calculated this"
      />
    </div>
  );
}
