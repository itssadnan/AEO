"use server";

import { getOrRunCrawlAudit, getLatestCrawlAudit } from "./crawl-audit";
import type { AuditActionState } from "./types";

/**
 * Server Action: Run a crawl-readiness audit for a brand.
 * Called from the CrawlAuditTrigger component in the Reports view.
 * Cache-aware: getOrRunCrawlAudit returns the existing audit row without a
 * new fetch if it's under 24h old, per the module's caching spec. If a
 * customer needs to force a fresh audit before 24h are up, that's a
 * deliberate future addition, not something silently folded in here.
 */
export async function runCrawlAuditAction(
  brandId: string,
  websiteUrl: string
): Promise<AuditActionState> {
  try {
    const audit = await getOrRunCrawlAudit(brandId, websiteUrl);
    return { ok: true, audit };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error running crawl audit";
    return { error: message };
  }
}

/**
 * Server Action: Fetch the latest crawl audit for a brand.
 * Called from the Reports page to display existing audit data.
 */
export async function getLatestCrawlAuditAction(
  brandId: string
): Promise<{ ok: true; audit: Awaited<ReturnType<typeof getLatestCrawlAudit>> } | { error: string }> {
  try {
    const audit = await getLatestCrawlAudit(brandId);
    return { ok: true, audit };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error fetching crawl audit";
    return { error: message };
  }
}