/**
 * Module 5.7: Crawl-Readiness Audit — pure checklist builder
 *
 * Deliberately isolated in its own file with ZERO imports from "@/lib/db"
 * or anything else that touches next/headers or server-only.
 *
 * crawl-audit-trigger.tsx ("use client") imports buildCrawlChecklist
 * through the module barrel (index.ts) per CONVENTIONS.md ("nothing
 * outside this folder may import from inside it directly, only through
 * this index.ts"). buildCrawlChecklist used to live in crawl-audit.ts
 * alongside runAndPersistCrawlAudit/getLatestCrawlAudit, which import
 * createSupabaseServerClient (next/headers, server-only) — so importing
 * buildCrawlChecklist from that file pulled the whole module, and its
 * server-only import chain, into the client bundle. That broke the
 * production build (Turbopack: "You're importing a module that depends
 * on next/headers... in the Pages Router" / "'server-only' cannot be
 * imported from a Client Component module") on commit 8a00d6b.
 *
 * See progress/modules/5.7-crawl-readiness-audit.md decisions log.
 */
import type { CrawlAuditRow, CrawlChecklistItem } from "./types";

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
