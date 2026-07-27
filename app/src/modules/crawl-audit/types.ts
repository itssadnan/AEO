/**
 * Module 5.7: Crawl-Readiness Audit — TypeScript types
 *
 * These are the runtime-agnostic types that the module's public API uses.
 * They mirror the Zod schemas but don't depend on Zod — callers that only
 * consume results don't need to import zod.
 */
import type { RobotsTxtResult, HeadingStructureResult } from "./schemas";

/** The five bots the spec requires us to audit in robots.txt. */
export const AUDITED_BOTS = [
  "GPTBot",
  "PerplexityBot",
  "ClaudeBot",
  "Google-Extended",
  "CCBot",
] as const;

export type AuditedBot = (typeof AUDITED_BOTS)[number];

/** The result of a single crawl-readiness audit, as returned to the UI. */
export interface CrawlAuditRow {
  id: string;
  brand_id: string;
  domain: string;
  robots_txt_result: RobotsTxtResult;
  llms_txt_present: boolean;
  schema_present: boolean;
  heading_structure: HeadingStructureResult;
  checked_at: string;
  created_at: string;
}

/** The shape returned by the audit Server Action. */
export type AuditActionState =
  | { ok: true; audit: CrawlAuditRow }
  | { error: string };

/** Checklist item type for UI rendering. */
export interface CrawlChecklistItem {
  id: string;
  label: string;
  status: "pass" | "fail" | "warning";
  fixInstructions?: string;
}
