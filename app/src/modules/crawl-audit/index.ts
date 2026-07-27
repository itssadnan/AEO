// Module 5.7 Crawl-Readiness Audit
// See progress/modules/*.md for acceptance criteria, decisions log, caching/security notes.
// Per docs/CONVENTIONS.md: nothing outside this folder may import from inside it directly,
// only through this index.ts — with one documented exception: crawl-audit-trigger.tsx
// ("use client") imports buildCrawlChecklist and its types directly from ./checklist and
// ./types, not this barrel, because this barrel also re-exports @/lib/db-touching functions
// (getOrRunCrawlAudit etc.) and Turbopack's Client Component boundary check runs on the
// barrel's static import graph, not which export is actually used — see CONVENTIONS.md
// "Exception — Client Components and barrel files".

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
