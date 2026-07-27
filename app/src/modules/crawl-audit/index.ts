// Module 5.7 Crawl-Readiness Audit
// See progress/modules/*.md for acceptance criteria, decisions log, caching/security notes.
// Per docs/CONVENTIONS.md: nothing outside this folder may import from inside it directly,
// only through this index.ts.

export {
  runAndPersistCrawlAudit,
  getLatestCrawlAudit,
  getOrRunCrawlAudit,
  buildCrawlChecklist,
} from "./crawl-audit";
export { runCrawlAudit } from "./fetchers";
export type {
  CrawlAuditRow,
  AuditActionState,
  AuditedBot,
  CrawlChecklistItem,
} from "./types";
export type { RobotsTxtResult, HeadingStructureResult, CrawlAuditResult } from "./schemas";
export { robotsTxtResultSchema, headingStructureResultSchema, crawlAuditResultSchema } from "./schemas";
