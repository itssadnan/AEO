"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EngineBadge } from "@/components/ui/engine-badge";
import { PlanBadge } from "@/components/ui/plan-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CalculationDisclosure } from "@/components/ui/calculation-disclosure";
import { formatRelativeTime } from "@/lib/utils";
import type {
  BrandWithRelations,
  PromptExplorerRow,
  OverviewMetrics,
  EmptyStateConfig,
  Competitor,
  Prompt,
} from "@/modules/dashboard/types";

interface PromptExplorerViewProps {
  brand: BrandWithRelations;
  overview: OverviewMetrics;
  emptyState: EmptyStateConfig;
  competitors: Competitor[];
  prompts: Prompt[];
  workspace: { id: string; name: string; plan_tier: "free" | "starter" | "growth" | "agency" };
}

/**
 * Prompt Explorer view — shows detailed per-prompt visibility data.
 */
export function PromptExplorerView({
  brand,
  overview,
  emptyState,
  competitors,
  prompts,
  workspace,
}: PromptExplorerViewProps) {
  const [engine, setEngine] = useState<"gemini" | "nvidia-nim">("gemini");
  const [promptData, setPromptData] = useState<PromptExplorerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch prompt explorer data
  const fetchPromptData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/${brand.id}/prompts?engine=${engine}`);
      if (!res.ok) throw new Error("Failed to fetch prompt data");
      const data = await res.json();
      setPromptData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on mount and engine change
  useEffect(() => {
    fetchPromptData();
  }, [engine, brand.id]);

  const hasData = promptData.length > 0 && !isLoading;

  if (!hasData && emptyState.planTier === "free" && !isLoading) {
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

        {/* Empty state guidance */}
        <EmptyState
          title="No prompt data yet"
          description="Add active prompts to your brand, then run a visibility check to see per-prompt AI mentions and rankings."
          cta={
            <a
              href="/brands/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Add prompts
            </a>
          }
        />
      </div>
    );
  }

  if (isLoading) {
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
        <Card className="p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--color-accent)] border-t-transparent mx-auto mb-4" />
          <p className="text-[var(--color-text-secondary)]">Loading prompt data...</p>
        </Card>
      </div>
    );
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
          <p className="text-[var(--color-negative)] mb-4">Error loading prompt data: {error}</p>
          <button
            onClick={fetchPromptData}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

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
          <p className="text-sm text-[var(--color-text-tertiary)]">Total Prompts</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {prompts.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[var(--color-text-tertiary)]">Prompts with Mentions</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {promptData.filter((p) => p.brandMentioned).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[var(--color-text-tertiary)]">Avg Visibility Score</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {promptData.length > 0
              ? Math.round(
                  promptData.reduce((sum, p) => sum + p.visibilityScore, 0) / promptData.length,
                )
              : 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-[var(--color-text-tertiary)]">Avg Citation Ratio</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {promptData.length > 0
              ? (
                  promptData.reduce((sum, p) => sum + p.citationRatio, 0) / promptData.length
                ).toFixed(2)
              : "0"}
          </p>
        </Card>
      </div>

      {/* Prompt data table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-[var(--color-text-primary)]">Prompt Explorer</h2>
          <span className="text-sm text-[var(--color-text-tertiary)]">
            {promptData.length} prompts
          </span>
        </div>

        <DataTable<PromptExplorerRow>
          data={promptData}
          keyExtractor={(row) => row.id}
          columns={[
            {
              key: "promptText",
              header: "Prompt",
              render: (row) => (
                <div>
                  <p className="font-medium text-[var(--color-text-primary)] truncate max-w-md">
                    {row.promptText}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
                    {row.id.slice(0, 8)}
                  </p>
                </div>
              ),
            },
            {
              key: "brandMentioned",
              header: "Mentioned",
              render: (row) => (
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                    row.brandMentioned
                      ? "bg-[var(--color-positive-muted)] text-[var(--color-positive)]"
                      : "bg-[var(--color-negative-muted)] text-[var(--color-negative)]"
                  }`}
                >
                  {row.brandMentioned ? "✓ Yes" : "✗ No"}
                </span>
              ),
            },
            {
              key: "brandPosition",
              header: "Position",
              render: (row) =>
                row.brandPosition ? (
                  <span className="font-mono tabular-nums text-[var(--color-text-primary)]">
                    #{row.brandPosition}
                  </span>
                ) : (
                  <span className="text-[var(--color-text-tertiary)]">—</span>
                ),
            },
            {
              key: "competitorMentions",
              header: "Competitors Found",
              render: (row) =>
                row.competitorMentions.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {row.competitorMentions.slice(0, 3).map((name, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-lg bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]"
                      >
                        {name}
                      </span>
                    ))}
                    {row.competitorMentions.length > 3 && (
                      <span className="inline-flex items-center rounded-lg bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-text-tertiary)]">
                        +{row.competitorMentions.length - 3} more
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[var(--color-text-tertiary)]">—</span>
                ),
            },
            {
              key: "visibilityScore",
              header: "Visibility Score",
              render: (row) => (
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums font-semibold text-[var(--color-text-primary)]">
                    {row.visibilityScore}
                  </span>
                  <div className="h-2 w-24 bg-[var(--color-surface-2)] rounded-full overflow-hidden flex-1 max-w-xs">
                    <div
                      className="h-full bg-[var(--color-accent)] rounded-full"
                      style={{ width: `${Math.min(row.visibilityScore, 100)}%` }}
                    />
                  </div>
                </div>
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
              key: "checkedAt",
              header: "Last Checked",
              render: (row) => (
                <span className="text-sm text-[var(--color-text-secondary)] font-mono tabular-nums">
                  {formatRelativeTime(row.checkedAt)}
                </span>
              ),
            },
            {
              key: "engine",
              header: "Engine",
              render: (row) => <EngineBadge engine={row.engine} size="sm" />,
            },
            {
              key: "actions",
              header: "Details",
              render: (row) => (
                <CalculationDisclosure
                  source={{
                    promptText: row.promptText,
                    provider: row.engine === "gemini" ? "gemini" : "nvidia-nim",
                    model: row.engine === "gemini" ? "Gemini 1.5 Flash" : "NVIDIA Nemotron 3 Ultra",
                    checkedAt: row.checkedAt,
                    rawAnswer: "Detailed answer available in check run detail view",
                    extractedEntities: {
                      brandMentioned: row.brandMentioned,
                      positionAmongCompetitors: row.brandPosition,
                      competitorNamesFound: row.competitorMentions,
                      citedDomains: [],
                      citedDomainTypes: [],
                    },
                  }}
                  triggerLabel="View details"
                />
              ),
            },
          ]}
          emptyMessage="No prompt data available. Run a visibility check to populate this table."
          className="w-full"
        />
      </Card>

      {/* Calculation disclosure for overall view */}
      <CalculationDisclosure
        source={{
          promptText: "Aggregated across all tracked prompts",
          provider: engine === "gemini" ? "gemini" : "nvidia-nim",
          model: engine === "gemini" ? "Gemini 1.5 Flash" : "NVIDIA Nemotron 3 Ultra",
          checkedAt: overview.lastChecked ?? new Date().toISOString(),
          rawAnswer: "Per-prompt visibility scores aggregated from check runs",
          extractedEntities: {
            brandMentioned: promptData.some((p) => p.brandMentioned),
            positionAmongCompetitors: null,
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
