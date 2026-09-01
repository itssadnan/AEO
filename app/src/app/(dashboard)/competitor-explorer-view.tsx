"use client";

import { useState, useCallback } from "react";
import * as React from "react";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EngineBadge } from "@/components/ui/engine-badge";
import { PlanBadge } from "@/components/ui/plan-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CalculationDisclosure } from "@/components/ui/calculation-disclosure";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ExplanationEnginePanel } from "./explanation-engine-panel";
import { formatRelativeTime, formatPercent, formatNumber } from "@/lib/utils";
import type {
  BrandWithRelations,
  CompetitorExplorerRow,
  OverviewMetrics,
  EmptyStateConfig,
  ExplanationEngineData,
  Competitor,
  Prompt,
} from "@/modules/dashboard/types";

interface CompetitorExplorerViewProps {
  brand: BrandWithRelations;
  overview: OverviewMetrics;
  emptyState: EmptyStateConfig;
  competitors: Competitor[];
  prompts: Prompt[];
  workspace: { id: string; name: string; plan_tier: "free" | "starter" | "growth" | "agency" };
  explanation: ExplanationEngineData;
}

/**
 * Competitor Explorer view — shows detailed competitor comparison data.
 */
export function CompetitorExplorerView({
  brand,
  overview,
  emptyState,
  competitors,
  workspace,
  explanation,
}: CompetitorExplorerViewProps) {
  const [engine, setEngine] = useState<"gemini" | "nvidia-nim">("gemini");
  const [competitorData, setCompetitorData] = useState<CompetitorExplorerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Competitor Explorer previously locked its entire view (including
  // Share-of-Voice) for any Free-tier workspace once it had competitors --
  // found 2026-09-01 to contradict this module's own acceptance criteria
  // (progress/modules/5.6-dashboard-frontend.md: "Share-of-Voice always
  // shown ... locked/upsell state" only for the separate Explanation
  // Engine / Opportunity Finder panels). That panel is now built --
  // see <ExplanationEnginePanel> below, which owns its own real,
  // DB-backed Free-plan lock. The billing plan cards (settings-view.tsx)
  // never listed competitor tracking as a paid-only feature either -- plan
  // tiers differ by usage limits (brands/prompts/check frequency), not by
  // walling off this page. Removed the plan-based lock entirely so every
  // tier sees the same competitor comparison table.

  // Fetch competitor explorer data
  const fetchCompetitorData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/${brand.id}/competitors?engine=${engine}`);
      if (!res.ok) throw new Error("Failed to fetch competitor data");
      const data = await res.json();
      setCompetitorData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [engine, brand.id]);

  // Load data on mount and engine change
  React.useEffect(() => {
    fetchCompetitorData();
  }, [fetchCompetitorData]);

  const hasData = competitorData.length > 0 && !isLoading;

  if (!hasData && emptyState.planTier !== "free" && !isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
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
          <div className="flex items-center gap-3">
            <EngineBadge engine={engine} size="sm" />
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as "gemini" | "nvidia-nim")}
              className="px-3 py-1.5 bg-[var(--color-surface-0)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="gemini">Google Gemini</option>
              <option value="nvidia-nim">NVIDIA NIM</option>
            </select>
          </div>
        </div>

        <EmptyState
          title="No competitor data yet"
          description="Add competitors to your brand, then run a visibility check to see how they compare in AI mentions and rankings."
          cta={
            <a
              href="/brands/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Add competitors
            </a>
          }
        />

        <ExplanationEnginePanel data={explanation} />
      </div>
    );
  }

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
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
        </div>
        <Card className="p-6">
          <p className="text-[var(--color-negative)] mb-4">
            Error loading competitor data: {error}
          </p>
          <button
            onClick={fetchCompetitorData}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  // Calculate total mentions for share of voice context
  const totalMentions = competitorData.reduce((sum, c) => sum + c.mentions, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Brand header with engine selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{brand.name}</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">
            Workspace: {workspace.name} •{" "}
            <PlanBadge plan={workspace.plan_tier as "free" | "starter" | "growth" | "agency"} />•
            Engine: {engine === "gemini" ? "Google Gemini" : "NVIDIA NIM"}• Last checked:{" "}
            {overview.lastChecked ? formatRelativeTime(overview.lastChecked) : "Never"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <EngineBadge engine={engine} size="sm" />
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as "gemini" | "nvidia-nim")}
            className="px-3 py-1.5 bg-[var(--color-surface-0)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="gemini">Google Gemini</option>
            <option value="nvidia-nim">NVIDIA NIM</option>
          </select>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-[var(--color-text-tertiary)]">Total Competitors</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {competitors.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[var(--color-text-tertiary)]">Competitors Mentioned</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {competitorData.filter((c) => c.mentions > 0).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[var(--color-text-tertiary)]">Total Mentions</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {formatNumber(totalMentions)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[var(--color-text-tertiary)]">Avg Citation Ratio</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {competitorData.length > 0
              ? (
                  competitorData.reduce((sum, c) => sum + c.citationRatio, 0) /
                  competitorData.length
                ).toFixed(2)
              : "0"}
          </p>
        </Card>
      </div>

      {/* Competitor data table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-[var(--color-text-primary)]">
            Competitor Explorer
          </h2>
          <span className="text-sm text-[var(--color-text-tertiary)]">
            {competitorData.length} competitors
          </span>
        </div>

        <DataTable<CompetitorExplorerRow>
          data={competitorData}
          keyExtractor={(row) => row.competitorId}
          columns={[
            {
              key: "competitorName",
              header: "Competitor",
              render: (row) => (
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">
                    {row.competitorName}
                  </p>
                  {row.competitorDomain && (
                    <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
                      {row.competitorDomain}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: "mentions",
              header: "Mentions",
              render: (row) => (
                <span className="font-mono tabular-nums font-semibold text-[var(--color-text-primary)]">
                  {formatNumber(row.mentions)}
                </span>
              ),
            },
            {
              key: "shareOfVoice",
              header: "Share of Voice",
              render: (row) => (
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums font-semibold text-[var(--color-text-primary)]">
                    {formatPercent(row.shareOfVoice)}
                  </span>
                  <div className="h-2 w-24 bg-[var(--color-surface-2)] rounded-full overflow-hidden flex-1 max-w-xs">
                    <div
                      className="h-full bg-[var(--color-border)] rounded-full"
                      style={{ width: `${Math.min(row.shareOfVoice, 100)}%` }}
                    />
                  </div>
                </div>
              ),
            },
            {
              key: "avgPosition",
              header: "Avg Position",
              render: (row) =>
                row.avgPosition > 0 ? (
                  <span className="font-mono tabular-nums text-[var(--color-text-primary)]">
                    #{row.avgPosition.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-[var(--color-text-tertiary)]">—</span>
                ),
            },
            {
              key: "citationRatio",
              header: "Citation Ratio",
              render: (row) => (
                <span className="font-mono tabular-nums text-[var(--color-text-primary)]">
                  {(row.citationRatio * 100).toFixed(0)}%
                </span>
              ),
            },
            {
              key: "lastChecked",
              header: "Last Checked",
              render: (row) => (
                <span className="text-sm text-[var(--color-text-secondary)] font-mono tabular-nums">
                  {row.lastChecked ? formatRelativeTime(row.lastChecked) : "Never"}
                </span>
              ),
            },
            {
              key: "engine",
              header: "Engine",
              render: (row) => <EngineBadge engine={row.engine} size="sm" />,
            },
          ]}
          emptyMessage="No competitor data available. Add competitors and run a visibility check."
          className="w-full"
        />
      </Card>

      {/* Explanation Engine / Opportunity Finder — Module 5.5's backend, surfaced here */}
      <ExplanationEnginePanel data={explanation} />

      {/* Calculation disclosure for competitor view */}
      <CalculationDisclosure
        source={{
          promptText: "Aggregated across all tracked prompts",
          provider: engine === "gemini" ? "gemini" : "nvidia-nim",
          model: engine === "gemini" ? "Gemini 1.5 Flash" : "NVIDIA Nemotron 3 Ultra",
          checkedAt: overview.lastChecked ?? new Date().toISOString(),
          rawAnswer: "Competitor mentions aggregated from check runs across all prompts",
          extractedEntities: {
            brandMentioned: true,
            positionAmongCompetitors: null,
            competitorNamesFound: competitorData.map((c) => c.competitorName),
            citedDomains: [],
            citedDomainTypes: [],
          },
        }}
        triggerLabel="How we calculated this"
      />
    </div>
  );
}
