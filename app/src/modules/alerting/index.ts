// Module 5.8 Alerting & Reporting
// See progress/modules/5.8-alerting-and-reporting.md for acceptance criteria,
// decisions log, caching/security notes.
//
// Architecture note: unlike most modules, the actual weekly-digest and
// threshold-alert logic does not live in this Next.js/Node module at all --
// it lives in Postgres functions (migration 0021: get_weekly_digest_candidates,
// get_new_threshold_alerts, record_alert_sent) and the alerting-worker Deno
// Edge Function that calls them and sends via Resend. There is nothing for a
// Next.js server action or API route to do here (no user-facing UI is in
// this module's acceptance criteria -- weekly digest and threshold alerts
// are both emails, not dashboard views). This folder's only real content is
// render.ts, a Node-side twin of the Deno worker's pure email-rendering
// functions, kept only so that logic has real unit-test coverage (same
// Deno/Node twin pattern used for the AI-provider files elsewhere in this
// project -- Deno Edge Functions can't import from app/src/**).
export {
  renderDigestEmail,
  renderThresholdAlertEmail,
  escapeHtml,
  CRAWL_ISSUE_LABELS,
} from "./render";
export type { DigestCandidate, ThresholdAlertCandidate } from "./render";
