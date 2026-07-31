/**
 * Module 5.8 — Alerting & Reporting: pure email-rendering functions.
 *
 * This is a Node-side twin of the identical rendering logic in
 * app/supabase/functions/alerting-worker/index.ts, kept in sync deliberately
 * (same pattern as the AI-provider Deno/Node twin pairs elsewhere in this
 * project — see docs/CONVENTIONS.md and Module 5.3's decisions log for why
 * that duplication exists: Deno Edge Functions can't import from
 * app/src/**, so pure logic worth unit-testing gets a small twin here
 * instead). This file exists purely so this logic has real Node test-runner
 * coverage; it is not imported by the actual worker at runtime.
 *
 * Security note (docs/CONVENTIONS.md Section 6, "Untrusted content"):
 * brand names, competitor names, and prompt text are all user-entered and
 * get embedded directly into generated HTML email bodies. escapeHtml() is
 * the only thing standing between that and a stored-XSS-in-email bug, so it
 * is applied to every user-controlled string before interpolation — see
 * alerting-render.test.ts for the tests proving this actually holds.
 */

export type DigestCandidate = {
  brand_name: string;
  current_score: number;
  prior_score: number | null;
  score_change: number;
  new_mentions: { prompt_id: string; prompt_text: string }[];
  lost_mentions: { prompt_id: string; prompt_text: string }[];
  crawl_issues: { issue: string; bot?: string }[];
};

export type ThresholdAlertCandidate = {
  brand_name: string;
  competitor_name: string;
  prompt_text: string;
  checked_at: string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const CRAWL_ISSUE_LABELS: Record<string, string> = {
  missing_schema_markup: "Missing schema.org structured data",
  missing_h1: "Missing an H1 heading",
  bot_disallowed: "An AI crawler is disallowed in robots.txt",
};

export function renderDigestEmail(c: DigestCandidate): {
  subject: string;
  html: string;
  text: string;
} {
  const direction = c.score_change > 0 ? "up" : c.score_change < 0 ? "down" : "unchanged";
  const changeText =
    c.score_change === 0 ? "unchanged" : `${direction} ${Math.abs(c.score_change)} points`;

  const mentionLines = [
    ...c.new_mentions.map((m) => `+ New mention: "${m.prompt_text}"`),
    ...c.lost_mentions.map((m) => `- Lost mention: "${m.prompt_text}"`),
  ];
  const crawlLines = c.crawl_issues.map((issue) => {
    const label = CRAWL_ISSUE_LABELS[issue.issue] ?? issue.issue;
    return issue.bot ? `- ${label} (${issue.bot})` : `- ${label}`;
  });

  const text = [
    `Weekly AEO Visibility digest for ${c.brand_name}`,
    ``,
    `Visibility Score: ${c.current_score} (${changeText}${c.prior_score === null ? ", first week with data" : ""})`,
    mentionLines.length
      ? `\nMention changes:\n${mentionLines.join("\n")}`
      : `\nNo mention changes this week.`,
    crawlLines.length ? `\nNew crawl issues:\n${crawlLines.join("\n")}` : `\nNo new crawl issues.`,
  ].join("\n");

  const html = `
    <h2>Weekly AEO Visibility digest for ${escapeHtml(c.brand_name)}</h2>
    <p><strong>Visibility Score:</strong> ${c.current_score} (${escapeHtml(changeText)}${c.prior_score === null ? ", first week with data" : ""})</p>
    ${mentionLines.length ? `<p><strong>Mention changes:</strong></p><ul>${mentionLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : "<p>No mention changes this week.</p>"}
    ${crawlLines.length ? `<p><strong>New crawl issues:</strong></p><ul>${crawlLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : "<p>No new crawl issues.</p>"}
  `.trim();

  return { subject: `Your weekly AEO Visibility digest: ${c.brand_name}`, html, text };
}

export function renderThresholdAlertEmail(c: ThresholdAlertCandidate): {
  subject: string;
  html: string;
  text: string;
} {
  const text = [
    `${c.competitor_name} was just cited by an AI engine on a prompt where ${c.brand_name} wasn't mentioned.`,
    ``,
    `Prompt: "${c.prompt_text}"`,
    `Checked: ${c.checked_at}`,
  ].join("\n");

  const html = `
    <h2>New competitor citation: ${escapeHtml(c.competitor_name)}</h2>
    <p><strong>${escapeHtml(c.competitor_name)}</strong> was just cited by an AI engine on a prompt where <strong>${escapeHtml(c.brand_name)}</strong> wasn't mentioned.</p>
    <p><strong>Prompt:</strong> "${escapeHtml(c.prompt_text)}"</p>
    <p><strong>Checked:</strong> ${escapeHtml(c.checked_at)}</p>
  `.trim();

  return { subject: `${c.competitor_name} newly cited where ${c.brand_name} wasn't`, html, text };
}
