"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { EngineBadge } from "@/components/ui/engine-badge";
import { PlanBadge } from "@/components/ui/plan-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CalculationDisclosure } from "@/components/ui/calculation-disclosure";
import { Button } from "@/components/ui/button";
import { formatNumber, formatPercent } from "@/lib/utils";
import { CrawlAuditTrigger } from "./crawl-audit-trigger";
import type {
  BrandWithRelations,
  OverviewMetrics,
  EmptyStateConfig,
  Competitor,
  Prompt,
  ReportData,
} from "@/modules/dashboard/types";
import type { CrawlAuditRow } from "@/modules/crawl-audit";

interface ReportsViewProps {
  brand: BrandWithRelations;
  overview: OverviewMetrics;
  emptyState: EmptyStateConfig;
  competitors: Competitor[];
  prompts: Prompt[];
  workspace: { id: string; name: string; plan_tier: "free" | "starter" | "growth" | "agency" };
  crawlAudit: CrawlAuditRow | null;
}

/**
 * Reports view — scheduled PDF/CSV reports and on-demand generation.
 * Includes Crawl-Readiness Audit section (Module 5.7).
 */
export function ReportsView({
  brand,
  overview,
  competitors,
  workspace,
  crawlAudit,
}: ReportsViewProps) {
  const [engine, setEngine] = useState<"gemini" | "nvidia-nim">("gemini");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Reports previously locked its ENTIRE page (including the always-should-
  // be-visible crawl-readiness checklist) for every non-paying workspace --
  // found 2026-09-01 to go well beyond what this module's own acceptance
  // criteria call for ("Reports: crawl-readiness checklist +
  // exportable/white-label summaries (Agency plan)" -- only the export/
  // white-label part is Agency-gated). Only the PDF/CSV export buttons
  // below are now gated; everything else, including this page's data view
  // and the crawl-readiness audit, is available to every plan tier.
  const canExport = workspace.plan_tier === "agency";

  const periodLabels = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
  };

  const fetchReportData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/${brand.id}/reports?engine=${engine}&period=${period}`,
      );
      if (!res.ok) throw new Error("Failed to fetch report data");
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setIsLoading(false);
    }
  }, [engine, period, brand.id]);

  const generateReport = async (format: "pdf" | "csv") => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/dashboard/${brand.id}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine, period, format }),
      });
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${brand.name}-report-${period}-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-fetch on mount and when engine/period changes
  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Brand header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{brand.name}</h1>
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

      {/* Report controls */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-lg font-medium text-[var(--color-text-primary)]">Generate Report</h2>
          <div className="flex items-center gap-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as "7d" | "30d" | "90d")}
              className="px-3 py-1.5 bg-[var(--color-surface-0)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            <Button
              onClick={() => fetchReportData()}
              disabled={isLoading}
              variant="secondary"
              size="sm"
            >
              {isLoading ? "Loading..." : "Refresh Data"}
            </Button>
            <Button
              onClick={() => generateReport("pdf")}
              disabled={isGenerating || !reportData || !canExport}
              variant="primary"
              size="sm"
              title={canExport ? undefined : "PDF/CSV export requires the Agency plan"}
            >
              {isGenerating ? "Generating..." : "Export PDF"}
            </Button>
            <Button
              onClick={() => generateReport("csv")}
              disabled={isGenerating || !reportData || !canExport}
              variant="secondary"
              size="sm"
              title={canExport ? undefined : "PDF/CSV export requires the Agency plan"}
            >
              Export CSV
            </Button>
          </div>
        </div>
        {!canExport && (
          <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
            PDF/CSV export is an Agency-plan feature. The report data above is available on every
            plan.
          </p>
        )}

        {error && (
          <div className="mb-4 p-4 bg-[var(--color-negative-muted)] border border-[var(--color-negative)] rounded-lg text-[var(--color-negative)]">
            Error: {error}
          </div>
        )}

        {reportData ? (
          <div className="space-y-6">
            {/* Report summary */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4">
                <p className="text-sm text-[var(--color-text-tertiary)]">Visibility Score</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {reportData.overview.visibilityScore}/100
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-[var(--color-text-tertiary)]">Share of Voice</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {formatPercent(reportData.overview.shareOfVoice)}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-[var(--color-text-tertiary)]">Rank</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  #{reportData.overview.rank} of {reportData.overview.totalCompetitors + 1}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-[var(--color-text-tertiary)]">Total Mentions</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {formatNumber(reportData.overview.mentionCount ?? 0)}
                </p>
              </Card>
            </div>

            {/* Period info */}
            <div className="p-4 bg-[var(--color-surface-1)] rounded-lg">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Report period: <strong>{periodLabels[period]}</strong> • Engine:{" "}
                {engine === "gemini" ? "Google Gemini" : "NVIDIA NIM"} • Generated:{" "}
                {new Date().toLocaleString()}
              </p>
            </div>

            {/* Prompt summary */}
            <div>
              <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-3">
                Prompt Performance
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {reportData.prompts.slice(0, 5).map((prompt) => (
                  <Card key={prompt.id} className="p-4">
                    <p className="font-medium text-[var(--color-text-primary)] truncate max-w-md mb-2">
                      {prompt.promptText}
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span
                        className={
                          prompt.brandMentioned
                            ? "text-[var(--color-positive)]"
                            : "text-[var(--color-negative)]"
                        }
                      >
                        {prompt.brandMentioned ? "✓ Mentioned" : "✗ Not mentioned"}
                      </span>
                      {prompt.brandPosition && (
                        <span className="font-mono tabular-nums">
                          Position: #{prompt.brandPosition}
                        </span>
                      )}
                      <span className="font-mono tabular-nums">
                        Score: {prompt.visibilityScore}
                      </span>
                      <span className="font-mono tabular-nums">
                        Citations: {(prompt.citationRatio * 100).toFixed(0)}%
                      </span>
                    </div>
                  </Card>
                ))}
                {reportData.prompts.length === 0 && (
                  <Card className="p-4 text-center text-[var(--color-text-tertiary)]">
                    No prompt data available for this period.
                  </Card>
                )}
              </div>
              {reportData.prompts.length > 5 && (
                <p className="text-sm text-[var(--color-text-tertiary)] mt-2">
                  Showing 5 of {reportData.prompts.length} prompts. Export CSV for full data.
                </p>
              )}
            </div>

            {/* Competitor summary */}
            {reportData.competitors.length > 0 && (
              <div>
                <h3 className="text-md font-medium text-[var(--color-text-primary)] mb-3">
                  Competitor Comparison
                </h3>
                <div className="space-y-2">
                  {reportData.competitors.map((comp) => (
                    <Card key={comp.competitorId} className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <p className="font-medium text-[var(--color-text-primary)]">
                            {comp.competitorName}
                          </p>
                          <EngineBadge engine={comp.engine} size="sm" />
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <span className="font-mono tabular-nums">
                            Mentions: {formatNumber(comp.mentions)}
                          </span>
                          <span className="font-mono tabular-nums">
                            SoV: {formatPercent(comp.shareOfVoice)}
                          </span>
                          <span className="font-mono tabular-nums">
                            Avg Pos: #{comp.avgPosition.toFixed(1)}
                          </span>
                          <span className="font-mono tabular-nums">
                            Citations: {(comp.citationRatio * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            title="No report data available"
            description="Run a visibility check to generate data for reports. Reports require at least one completed check run."
            cta={
              <Button onClick={fetchReportData} disabled={isLoading} variant="primary">
                {isLoading ? "Loading..." : "Refresh Data"}
              </Button>
            }
          />
        )}
      </Card>

      {/* Crawl Readiness Audit section (Module 5.7) — CrawlAuditTrigger
          renders its own root Card, so no wrapping Card here (avoids a
          double-nested card). */}
      <CrawlAuditTrigger brandId={brand.id} websiteUrl={brand.website} initialAudit={crawlAudit} />

      {/* Scheduled reports section (placeholder for future) */}
      <Card className="p-6">
        <h2 className="text-lg font-medium text-[var(--color-text-primary)] mb-4">
          Scheduled Reports
        </h2>
        <EmptyState
          title="No scheduled reports"
          description="Schedule automated PDF/CSV reports to be delivered via email. This feature requires a Pro or higher plan."
          cta={
            <a
              href="/settings/billing"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Upgrade to Pro
            </a>
          }
        />
      </Card>

      {/* Calculation disclosure */}
      <CalculationDisclosure
        source={{
          promptText: "Aggregated across all tracked prompts for the selected period",
          provider: engine === "gemini" ? "gemini" : "nvidia-nim",
          model: engine === "gemini" ? "Gemini 1.5 Flash" : "NVIDIA Nemotron 3 Ultra",
          checkedAt: overview.lastChecked ?? new Date().toISOString(),
          rawAnswer: "Report data aggregated from visibility snapshots and check runs",
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
