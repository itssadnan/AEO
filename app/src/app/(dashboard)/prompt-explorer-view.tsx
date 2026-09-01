"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import * as React from "react";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EngineBadge } from "@/components/ui/engine-badge";
import { PlanBadge } from "@/components/ui/plan-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CalculationDisclosure } from "@/components/ui/calculation-disclosure";
import { PendingChecksNotice } from "@/components/ui/pending-checks-notice";
import { formatRelativeTime } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/skeleton";
import { adminEnqueueCheckAction, getCheckStatusAction } from "@/modules/admin/actions";
import type { CheckStatusResult } from "@/modules/admin";
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
  /** True only for the site admin (requireAdmin() allowlist) — see prompts/page.tsx. */
  isAdmin?: boolean;
}

/**
 * Admin-only "run a real check now and watch the AI's actual response come
 * back" panel — the direct answer to "I don't see any feature page which
 * checks with the LLM and gives a response". Uses adminEnqueueCheckAction
 * (works on any plan tier, unlike the customer-facing free-check flow) and
 * polls getCheckStatusAction until the background worker finishes the job.
 * Shows the real result honestly, including a rate-limited/error outcome --
 * as of 2026-08-14, most live Gemini grounded-search checks come back
 * rate_limited because of Google's Search-grounding quota, not this code.
 */
function RunCheckNowPanel({
  workspaceId,
  brandId,
  prompts,
}: {
  workspaceId: string;
  brandId: string;
  prompts: Prompt[];
}) {
  const [selectedPromptId, setSelectedPromptId] = useState(prompts[0]?.id ?? "");
  const [jobId, setJobId] = useState<string | null>(null);
  const [checkStatus, setCheckStatus] = useState<CheckStatusResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  // True when the job we're showing/polling is one that was already queued
  // from a previous click, not one this click just created -- see the
  // BUG FIX comment on adminEnqueueCheckAction (2026-09-01). Purely
  // cosmetic (changes the note shown above the status block); polling
  // behaves identically either way.
  const [isExistingJob, setIsExistingJob] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // BUG FIX (2026-09-01): a "retry" job (rate-limited, will be retried
  // automatically by the background worker -- see retry_or_fail_check_job,
  // migration 0007) used to keep this button stuck on "Running..." and kept
  // polling every 3s for up to an hour per attempt (the function's own
  // backoff clamp), which is both wasteful and -- because isBusy never
  // cleared -- looked exactly like the admin's earlier report of "it just
  // said queued and no response". A rate-limited retry is real, useful
  // information the moment it happens, not a hang: treat it as a terminal
  // state for this click (re-enable the button, stop hammering the poll
  // endpoint every 3s) while still slow-polling in the background so a
  // later automatic retry that succeeds still updates the panel live.
  function pollStatus(currentJobId: string, intervalMs: number) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const status = await getCheckStatusAction(currentJobId);
      if ("error" in status) {
        setPanelError(status.error);
        setIsBusy(false);
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      setCheckStatus(status);
      if (status.status === "completed" || status.status === "failed") {
        setIsBusy(false);
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (status.status === "retry" && intervalMs !== 20000) {
        // Slow down from the initial fast poll once we know this is a real
        // backoff wait (could be up to an hour), not an imminent pickup.
        setIsBusy(false);
        pollStatus(currentJobId, 20000);
      }
    }, intervalMs);
  }

  async function handleRunCheck() {
    if (!selectedPromptId) return;
    setIsBusy(true);
    setPanelError(null);
    setCheckStatus(null);
    setIsExistingJob(false);
    const result = await adminEnqueueCheckAction(workspaceId, brandId, selectedPromptId);
    if ("error" in result) {
      setPanelError(result.error);
      setIsBusy(false);
      return;
    }
    setJobId(result.jobId);
    setIsExistingJob(result.existing === true);
    pollStatus(result.jobId, 3000);
  }

  return (
    <Card className="p-6 border-2 border-dashed border-[var(--color-accent)]/40">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium text-[var(--color-text-primary)]">
          Run a check now (Admin)
        </h2>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          Queues a real Gemini grounded-search call for the selected prompt
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select
          value={selectedPromptId}
          onChange={(e) => setSelectedPromptId(e.target.value)}
          disabled={isBusy}
          className="flex-1 px-3 py-2 bg-[var(--color-surface-0)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] disabled:opacity-50"
        >
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.text}
            </option>
          ))}
        </select>
        <button
          onClick={handleRunCheck}
          disabled={isBusy || !selectedPromptId}
          className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {isBusy ? "Running…" : "Run check now"}
        </button>
      </div>

      {panelError && <p className="text-sm text-[var(--color-negative)] mb-2">{panelError}</p>}

      {jobId && checkStatus && (
        <div className="p-4 bg-[var(--color-surface-1)] rounded-lg text-sm space-y-2">
          {isExistingJob && (
            <p className="text-[var(--color-text-tertiary)]">
              A check for this prompt was already queued from an earlier click — showing its status
              below instead of starting a duplicate.
            </p>
          )}
          <p className="text-[var(--color-text-secondary)]">
            Job status: <span className="font-mono">{checkStatus.status}</span>
            {checkStatus.lastErrorCode ? ` (${checkStatus.lastErrorCode})` : ""}
          </p>
          {checkStatus.run && (
            <>
              <p className="text-[var(--color-text-secondary)]">
                Run result:{" "}
                <span
                  className={`font-mono font-medium ${
                    checkStatus.run.status === "success"
                      ? "text-[var(--color-positive)]"
                      : "text-[var(--color-negative)]"
                  }`}
                >
                  {checkStatus.run.status}
                </span>{" "}
                ({checkStatus.run.provider} / {checkStatus.run.model})
              </p>
              {checkStatus.run.status === "rate_limited" && (
                <p className="text-[var(--color-warning)]">
                  Rate limited by the AI provider — this is a live quota limit, not a bug. See
                  &quot;How it works&quot; for current model/quota details.
                </p>
              )}
              {checkStatus.run.rawAnswer && (
                <div className="mt-2 p-3 bg-[var(--color-surface-0)] rounded border border-[var(--color-border)] max-h-64 overflow-y-auto whitespace-pre-wrap text-[var(--color-text-primary)]">
                  {checkStatus.run.rawAnswer}
                </div>
              )}
            </>
          )}
          {(checkStatus.status === "queued" || checkStatus.status === "processing") && (
            <p className="text-[var(--color-text-tertiary)]">
              Waiting for the background worker to pick this up — polling every 3s…
            </p>
          )}
          {checkStatus.status === "retry" && (
            <p className="text-[var(--color-text-tertiary)]">
              {checkStatus.run?.status === "rate_limited"
                ? "Rate limited on this attempt (see above) — "
                : "This attempt failed and "}
              the background worker will retry automatically
              {checkStatus.availableAt
                ? ` around ${new Date(checkStatus.availableAt).toLocaleTimeString()}`
                : " shortly"}
              . You can close this or try another prompt in the meantime — this panel will keep
              updating in the background.
            </p>
          )}
        </div>
      )}
    </Card>
  );
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
  isAdmin = false,
}: PromptExplorerViewProps) {
  const [engine, setEngine] = useState<"gemini" | "nvidia-nim">("gemini");
  const [promptData, setPromptData] = useState<PromptExplorerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch prompt explorer data
  const fetchPromptData = useCallback(async () => {
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
  }, [engine, brand.id]);

  // Load data on mount and engine change
  React.useEffect(() => {
    fetchPromptData();
  }, [fetchPromptData]);

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

        {isAdmin && prompts.length > 0 && (
          <RunCheckNowPanel workspaceId={workspace.id} brandId={brand.id} prompts={prompts} />
        )}

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

      {isAdmin && prompts.length > 0 && (
        <RunCheckNowPanel workspaceId={workspace.id} brandId={brand.id} prompts={prompts} />
      )}

      {/* BUG FIX (2026-09-01): a paid-tier brand with prompts configured
          but zero completed check_runs reaches this full table render (the
          free-tier-only empty state above only gates on
          emptyState.planTier === "free"), and the table's own emptyMessage
          ("No prompt data available. Run a visibility check to populate
          this table.") doesn't say whether a check is already in flight.
          Same honest-zero-state fix as Reports/Overview. */}
      {!hasData && (
        <PendingChecksNotice
          hasPendingChecks={emptyState.hasPendingChecks}
          mostRecentPendingErrorCode={emptyState.mostRecentPendingErrorCode}
        />
      )}

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
