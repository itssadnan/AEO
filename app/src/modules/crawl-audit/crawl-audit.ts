/**
 * Module 5.7: Crawl-Readiness Audit — Core module logic
 *
 * This is the single source of truth for the audit logic. The Server Action
 * (actions.ts) and any future scheduled worker both call this function.
 * No AI calls — this module is purely HTTP + parsing.
 */
import { createSupabaseServerClient } from "@/lib/db";
import { runCrawlAudit } from "./fetchers";
import type { CrawlAuditRow } from "./types";

/**
 * Runs a crawl-readiness audit for a brand and persists the result.
 * Returns the inserted audit row on success, throws on failure.
 * Always fetches fresh — does NOT check cache.
 */
export async function runAndPersistCrawlAudit(
  brandId: string,
  websiteUrl: string
): Promise<CrawlAuditRow> {
  const supabase = await createSupabaseServerClient();

  // Run the audit (includes SSRF guard, fetch, parse, validate)
  const auditData = await runCrawlAudit(websiteUrl);

  // Insert into crawl_audits
  const { data, error } = await supabase
    .from("crawl_audits")
    .insert({
      brand_id: brandId,
      domain: auditData.domain,
      robots_txt_result: auditData.robots_txt_result,
      llms_txt_present: auditData.llms_txt_present,
      schema_present: auditData.schema_present,
      heading_structure: auditData.heading_structure,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to persist crawl audit: ${error.message}`);
  }

  return {
    id: data.id,
    brand_id: data.brand_id,
    domain: data.domain,
    robots_txt_result: data.robots_txt_result as CrawlAuditRow["robots_txt_result"],
    llms_txt_present: data.llms_txt_present,
    schema_present: data.schema_present,
    heading_structure: data.heading_structure as CrawlAuditRow["heading_structure"],
    checked_at: data.checked_at,
    created_at: data.created_at,
  };
}

/**
 * Fetches the latest crawl audit for a brand (for display in Reports view).
 * Returns null if no audit exists yet.
 */
export async function getLatestCrawlAudit(brandId: string): Promise<CrawlAuditRow | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("crawl_audits")
    .select("*")
    .eq("brand_id", brandId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch crawl audit: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    brand_id: data.brand_id,
    domain: data.domain,
    robots_txt_result: data.robots_txt_result as CrawlAuditRow["robots_txt_result"],
    llms_txt_present: data.llms_txt_present,
    schema_present: data.schema_present,
    heading_structure: data.heading_structure as CrawlAuditRow["heading_structure"],
    checked_at: data.checked_at,
    created_at: data.created_at,
  };
}

/**
 * Pure decision function: is a stored audit's checked_at recent enough to
 * serve as a cache hit (within the last 24h)? Extracted from
 * getOrRunCrawlAudit specifically so this decision can be unit tested
 * without touching Supabase — see tests/unit/crawl-audit.test.ts.
 */
export function isAuditFresh(checkedAt: string, now: Date = new Date()): boolean {
  const checkedAtMs = new Date(checkedAt).getTime();
  const twentyFourHoursAgo = now.getTime() - 24 * 60 * 60 * 1000;
  return checkedAtMs > twentyFourHoursAgo;
}

/**
 * Gets the latest crawl audit for a brand, or runs a fresh one if the cached
 * audit is older than 24 hours (or doesn't exist).
 * This is the cache-aware entry point specified in the original spec's
 * Public Interface section — the Server Action calls this, not runAndPersistCrawlAudit.
 */
export async function getOrRunCrawlAudit(
  brandId: string,
  websiteUrl: string
): Promise<CrawlAuditRow> {
  const latest = await getLatestCrawlAudit(brandId);

  if (latest && isAuditFresh(latest.checked_at)) {
    // Cache hit — return existing audit without new fetches
    return latest;
  }

  // Cache miss or no audit — run fresh
  return runAndPersistCrawlAudit(brandId, websiteUrl);
}
