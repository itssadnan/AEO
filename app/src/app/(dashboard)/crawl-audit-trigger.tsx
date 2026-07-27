"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { runCrawlAuditAction, getLatestCrawlAuditAction } from "@/modules/crawl-audit/actions";
import type { CrawlAuditRow } from "@/modules/crawl-audit";

interface CrawlAuditTriggerProps {
  brandId: string;
  websiteUrl: string | null | undefined;
  initialAudit: CrawlAuditRow | null;
}

/**
 * Crawl-Readiness Audit trigger component.
 * Renders in the Reports view as a narrow, spec-authorized section.
 * Calls the runCrawlAuditAction Server Action.
 */
export function CrawlAuditTrigger({ brandId, websiteUrl, initialAudit }: CrawlAuditTriggerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [audit, setAudit] = useState<CrawlAuditRow | null>(initialAudit);
  const [error, setError] = useState<string | null>(null);

  const handleRunAudit = async () => {
    if (!websiteUrl) {
      setError("No website URL configured for this brand");
      return;
    }

    setIsRunning(true);
    setError(null);

    const result = await runCrawlAuditAction(brandId, websiteUrl);

    if ("error" in result) {
      setError(result.error);
    } else {
      setAudit(result.audit);
    }

    setIsRunning(false);
  };

  const handleRefresh = async () => {
    setIsRunning(true);
    setError(null);

    const result = await getLatestCrawlAuditAction(brandId);

    if ("error" in result) {
      setError(result.error);
    } else {
      setAudit(result.audit);
    }

    setIsRunning(false);
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString();

  const renderBotStatus = (bots: Record<string, { allowed: boolean }>) => (
    <div className="space-y-2">
      {Object.entries(bots).map(([bot, { allowed }]) => (
        <div key={bot} className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-text-secondary)]">{bot}</span>
          <span
            className={`font-mono text-xs px-2 py-0.5 rounded ${
              allowed ? "bg-[var(--color-positive-muted)] text-[var(--color-positive)]" : "bg-[var(--color-negative-muted)] text-[var(--color-negative)]"
            }`}
          >
            {allowed ? "Allowed" : "Blocked"}
          </span>
        </div>
      ))}
    </div>
  );

  const renderHeadingCounts = (headings: CrawlAuditRow["heading_structure"]) => (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="text-center p-2 bg-[var(--color-surface-1)] rounded">
        <div className="font-mono text-lg">{headings.h1_count}</div>
        <div className="text-[var(--color-text-tertiary)]">H1</div>
      </div>
      <div className="text-center p-2 bg-[var(--color-surface-1)] rounded">
        <div className="font-mono text-lg">{headings.h2_count}</div>
        <div className="text-[var(--color-text-tertiary)]">H2</div>
      </div>
      <div className="text-center p-2 bg-[var(--color-surface-1)] rounded">
        <div className="font-mono text-lg">{headings.h3_count}</div>
        <div className="text-[var(--color-text-tertiary)]">H3</div>
      </div>
      <div className="text-center p-2 bg-[var(--color-surface-1)] rounded">
        <div className="font-mono text-lg">{headings.h4_count}</div>
        <div className="text-[var(--color-text-tertiary)]">H4</div>
      </div>
      <div className="text-center p-2 bg-[var(--color-surface-1)] rounded">
        <div className="font-mono text-lg">{headings.h5_count}</div>
        <div className="text-[var(--color-text-tertiary)]">H5</div>
      </div>
      <div className="text-center p-2 bg-[var(--color-surface-1)] rounded">
        <div className="font-mono text-lg">{headings.h6_count}</div>
        <div className="text-[var(--color-text-tertiary)]">H6</div>
      </div>
    </div>
  );

  if (!websiteUrl) {
    return (
      <Card className="p-6">
        <EmptyState
          title="No website configured"
          description="Add a website URL to this brand in Settings to enable crawl-readiness audits."
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-medium text-[var(--color-text-primary)]">Crawl-Readiness Audit</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Check if AI crawlers can access and understand your site
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRunAudit}
            disabled={isRunning || !websiteUrl}
            variant="primary"
            size="sm"
            isLoading={isRunning}
          >
            {audit ? "Re-run Audit" : "Run Audit"}
          </Button>
          <Button onClick={handleRefresh} disabled={isRunning} variant="secondary" size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-[var(--color-negative-muted)] border border-[var(--color-negative)] rounded-lg text-[var(--color-negative)] text-sm">
          {error}
        </div>
      )}

      {audit ? (
        <div className="space-y-6">
          {/* Domain & timestamp */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 bg-[var(--color-surface-1)] rounded-lg">
            <div>
              <p className="font-mono text-sm text-[var(--color-text-primary)]">{audit.domain}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Last checked: {formatDate(audit.checked_at)}
              </p>
            </div>
          </div>

          {/* robots.txt */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-[var(--color-text-primary)]">robots.txt</h4>
            {renderBotStatus(audit.robots_txt_result.bots)}
          </div>

          {/* llms.txt */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-[var(--color-text-primary)]">llms.txt</h4>
            <div className="flex items-center gap-3">
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded ${
                  audit.llms_txt_present
                    ? "bg-[var(--color-positive-muted)] text-[var(--color-positive)]"
                    : "bg-[var(--color-negative-muted)] text-[var(--color-negative)]"
                }`}
              >
                {audit.llms_txt_present ? "Present" : "Missing"}
              </span>
              <span className="text-sm text-[var(--color-text-secondary)]">
                {audit.llms_txt_present
                  ? "Found at /llms.txt"
                  : "Add an llms.txt file to help AI crawlers understand your content"}
              </span>
            </div>
          </div>

          {/* Schema.org */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-[var(--color-text-primary)]">Schema.org Structured Data</h4>
            <div className="flex items-center gap-3">
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded ${
                  audit.schema_present
                    ? "bg-[var(--color-positive-muted)] text-[var(--color-positive)]"
                    : "bg-[var(--color-negative-muted)] text-[var(--color-negative)]"
                }`}
              >
                {audit.schema_present ? "Detected" : "Not detected"}
              </span>
              <span className="text-sm text-[var(--color-text-secondary)]">
                {audit.schema_present
                  ? "JSON-LD or microdata with schema.org vocabulary found"
                  : "Add structured data (JSON-LD recommended) to help AI understand your content"}
              </span>
            </div>
          </div>

          {/* Heading structure */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-[var(--color-text-primary)]">Heading Structure (H1–H6)</h4>
            {renderHeadingCounts(audit.heading_structure)}
            {audit.heading_structure.has_multiple_h1 && (
              <p className="text-xs text-[var(--color-warning)]">
                ⚠ Multiple H1 tags detected — consider using only one H1 per page for better accessibility and SEO.
              </p>
            )}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No audit run yet"
          description={`Click "Run Audit" to check your site's crawl readiness for AI answer engines.`}
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.238 1.003.074l3.75-1.5c.492-.197 1.028-.03 1.364.393.336.423.332 1.094-.008 1.459l-3.177 3.812c-.178.215-.232.516-.135.772.047.128.11.248.187.355a9.06 9.06 0 012.401 1.846c.37.382.599.894.599 1.418v4.074c0 .817-.643 1.48-1.438 1.48H5.654c-.795 0-1.438-.663-1.438-1.48V11.48c0-.524.23-1.036.599-1.418a9.06 9.06 0 012.4-1.846c.077-.107.14-.227.187-.355.097-.256.043-.557-.135-.772L1.668 5.29c-.34-.365-.344-1.036.008-1.459.336-.423.872-.59 1.364-.393l3.75 1.5c.283-.164.679-.122 1.003-.074.073-.044.146-.087.22-.127.332-.184.582-.496.645-.87.063-.374.313-.686.645-.87l.213-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
      )}
    </Card>
  );
}