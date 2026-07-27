// Module 5.7 Crawl-Readiness Audit
// See progress/modules/*.md for acceptance criteria, decisions log, caching/security notes.
// Per docs/CONVENTIONS.md: nothing outside this folder may import from inside it directly,
// only through this index.ts.

export {
  runAndPersistCrawlAudit,
  getLatestCrawlAudit,
  getOrRunCrawlAudit,
  isAuditFresh,
} from "./crawl-audit";
// buildCrawlChecklist is deliberately re-exported from its own file
// (checklist.ts), not crawl-audit.ts — see checklist.ts's header comment.
// It has to stay import-free of "@/lib/db" so client components can
// import it through this barrel without pulling next/headers/server-only
// into the browser bundle.
export { buildCrawlChecklist } from "./checklist";
export { runCrawlAudit } from "./fetchers";
export type {
  CrawlAuditRow,
  AuditActionState,
  AuditedBot,
  CrawlChecklistItem,
} from "./types";
export type { RobotsTxtResult, HeadingStructureResult, CrawlAuditResult } from "./schemas";
export { robotsTxtResultSchema, headingStructureResultSchema, crawlAuditResultSchema } from "./schemas";
