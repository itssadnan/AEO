import "server-only";
import type { ReportData } from "./types";

/** Quotes a CSV field per RFC 4180: wrap in quotes and double any embedded quote, whenever the field contains a comma, quote, or newline. */
function csvField(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields: Array<string | number | boolean | null | undefined>): string {
  return fields.map(csvField).join(",");
}

/**
 * Builds the CSV export for Reports -> Export CSV: an overview summary
 * block followed by the full (unsliced) prompt and competitor tables --
 * the UI's own inline table only shows 5 prompts and says "Export CSV for
 * full data", so this must include every row, not just what's on screen.
 */
export function buildReportCsv(report: ReportData): string {
  const lines: string[] = [];

  lines.push(csvRow(["AEO Visibility Report", report.brandName]));
  lines.push(csvRow(["Period", `${report.periodStart} to ${report.periodEnd}`]));
  lines.push(csvRow(["Engine", report.engine === "gemini" ? "Google Gemini" : "NVIDIA NIM"]));
  lines.push("");

  lines.push(csvRow(["Overview"]));
  lines.push(csvRow(["Visibility Score", report.overview.visibilityScore]));
  lines.push(csvRow(["Share of Voice (%)", report.overview.shareOfVoice]));
  lines.push(
    csvRow(["Rank", `${report.overview.rank} of ${report.overview.totalCompetitors + 1}`]),
  );
  lines.push(csvRow(["Total Prompts Tracked", report.overview.totalPrompts]));
  lines.push(csvRow(["Total Competitors Tracked", report.overview.totalCompetitors]));
  lines.push(csvRow(["Last Checked", report.overview.lastChecked ?? "Never"]));
  lines.push("");

  lines.push(csvRow(["Prompts"]));
  lines.push(
    csvRow([
      "Prompt",
      "Brand Mentioned",
      "Position",
      "Visibility Score",
      "Citation Ratio",
      "Competitor Mentions",
      "Checked At",
    ]),
  );
  for (const p of report.prompts) {
    lines.push(
      csvRow([
        p.promptText,
        p.brandMentioned ? "Yes" : "No",
        p.brandPosition ?? "",
        p.visibilityScore,
        p.citationRatio,
        p.competitorMentions.join("; "),
        p.checkedAt,
      ]),
    );
  }
  lines.push("");

  lines.push(csvRow(["Competitors"]));
  lines.push(
    csvRow([
      "Competitor",
      "Mentions",
      "Share of Voice (%)",
      "Avg Position",
      "Citation Ratio",
      "Last Checked",
    ]),
  );
  for (const c of report.competitors) {
    lines.push(
      csvRow([
        c.competitorName,
        c.mentions,
        c.shareOfVoice,
        c.avgPosition,
        c.citationRatio,
        c.lastChecked ?? "Never",
      ]),
    );
  }

  return lines.join("\r\n");
}

/**
 * Builds the plain-text content (one entry per line) for Reports -> Export
 * PDF, fed to buildSimpleTextPdf (src/lib/pdf/simple-pdf.ts). Kept as plain
 * strings -- not markup -- deliberately, since that writer only lays out
 * text lines.
 */
export function buildReportPdfLines(report: ReportData): string[] {
  const lines: string[] = [];
  lines.push(`AEO Visibility Report - ${report.brandName}`);
  lines.push(
    `Period: ${report.periodStart.slice(0, 10)} to ${report.periodEnd.slice(0, 10)}  |  Engine: ${
      report.engine === "gemini" ? "Google Gemini" : "NVIDIA NIM"
    }`,
  );
  lines.push("");
  lines.push("Overview");
  lines.push(`  Visibility Score: ${report.overview.visibilityScore}/100`);
  lines.push(`  Share of Voice: ${report.overview.shareOfVoice}%`);
  lines.push(`  Rank: #${report.overview.rank} of ${report.overview.totalCompetitors + 1}`);
  lines.push(`  Total Prompts Tracked: ${report.overview.totalPrompts}`);
  lines.push(`  Total Competitors Tracked: ${report.overview.totalCompetitors}`);
  lines.push(`  Last Checked: ${report.overview.lastChecked ?? "Never"}`);
  lines.push("");

  lines.push(`Prompts (${report.prompts.length})`);
  if (report.prompts.length === 0) {
    lines.push("  No prompt data for this period.");
  }
  for (const p of report.prompts) {
    lines.push(`  - ${p.promptText}`);
    lines.push(
      `      ${p.brandMentioned ? "Mentioned" : "Not mentioned"}` +
        (p.brandPosition ? `, position #${p.brandPosition}` : "") +
        `, score ${p.visibilityScore}, citation ratio ${(p.citationRatio * 100).toFixed(0)}%`,
    );
  }
  lines.push("");

  lines.push(`Competitors (${report.competitors.length})`);
  if (report.competitors.length === 0) {
    lines.push("  No competitor data for this period.");
  }
  for (const c of report.competitors) {
    lines.push(
      `  - ${c.competitorName}: ${c.mentions} mentions, ${c.shareOfVoice}% share of voice, ` +
        `avg position #${c.avgPosition.toFixed(1)}, citation ratio ${(c.citationRatio * 100).toFixed(0)}%`,
    );
  }

  return lines;
}
