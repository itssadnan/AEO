/**
 * Module 5.7: Crawl-Readiness Audit — Core module logic
 *
 * This is the single source of truth for the audit logic. The Server Action
 * (actions.ts) and any future scheduled worker both call this function.
 * No AI calls — this module is purely HTTP + parsing.
 */
import { createSupabaseServerClient } from "@/lib/db";
import { runCrawlAudit } from "./fetchers";
import type { CrawlAuditRow, CrawlChecklistItem } from "./types";

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

  if (latest) {
    const checkedAt = new Date(latest.checked_at).getTime();
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

    if (checkedAt > twentyFourHoursAgo) {
      // Cache hit — return existing audit without new fetches
      return latest;
    }
  }

  // Cache miss or no audit — run fresh
  return runAndPersistCrawlAudit(brandId, websiteUrl);
}

/**
 * Builds a checklist from a crawl audit for UI rendering.
 * Pure function — no I/O, no side effects.
 * Maps the stored audit into pass/fail/warning items with fix instructions.
 */
export function buildCrawlChecklist(audit: CrawlAuditRow): CrawlChecklistItem[] {
  const items: CrawlChecklistItem[] = [];

  // One item per audited bot
  for (const [bot, { allowed }] of Object.entries(audit.robots_txt_result.bots)) {
    items.push({
      id: `robots-${bot}`,
      label: `robots.txt: ${bot}`,
      status: allowed ? "pass" : "fail",
      fixInstructions: allowed
        ? undefined
        : `Update robots.txt to allow ${bot} (User-agent: ${bot}\\nAllow: /)`,
    });
  }

  // llms.txt — pass if present, warning (never fail) if absent
  items.push({
    id: "llms-txt",
    label: "llms.txt present",
    status: audit.llms_txt_present ? "pass" : "warning",
    fixInstructions: audit.llms_txt_present
      ? undefined
      : "Optional: no major AI vendor has confirmed llms.txt affects citations yet. Add /llms.txt if you want to guide crawlers.",
  });

  // Schema.org — pass/fail
  items.push({
    id: "schema-org",
    label: "Schema.org structured data",
    status: audit.schema_present ? "pass" : "fail",
    fixInstructions: audit.schema_present
      ? undefined
      : "Add JSON-LD or microdata with schema.org vocabulary to help AI understand your content.",
  });

  // Heading structure — pass if exactly one H1, warning if zero or multiple
  const h1Count = audit.heading_structure.h1_count;
  let headingStatus: "pass" | "fail" | "warning" = "pass";
  let headingFix: string | undefined;

  if (h1Count === 1) {
    headingStatus = "pass";
  } else if (h1Count === 0) {
    headingStatus = "warning";
    headingFix = "Add exactly one H1 tag to the page for accessibility and SEO.";
  } else {
    headingStatus = "warning";
    headingFix = `Found ${h1Count} H1 tags — use exactly one H1 per page for better accessibility and SEO.`;
  }

  items.push({
    id: "heading-structure",
    label: "Heading structure (H1–H6)",
    status: headingStatus,
    fixInstructions: headingFix,
  });

  return items;
}
