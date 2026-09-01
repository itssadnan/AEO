import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReportCsv, buildReportPdfLines } from "../../src/modules/dashboard/report-export.ts";
import type { ReportData } from "../../src/modules/dashboard/types.ts";

const sampleReport: ReportData = {
  brandId: "brand-1",
  brandName: 'Acme, "The" Best',
  periodStart: "2026-08-01T00:00:00.000Z",
  periodEnd: "2026-09-01T00:00:00.000Z",
  overview: {
    visibilityScore: 42,
    shareOfVoice: 18.5,
    rank: 2,
    totalCompetitors: 3,
    totalPrompts: 5,
    lastChecked: "2026-08-30T00:00:00.000Z",
    engine: "gemini",
  },
  prompts: [
    {
      id: "p1",
      promptText: "best tool, with a comma",
      brandMentioned: true,
      brandPosition: 1,
      competitorMentions: ["Rival A", "Rival B"],
      visibilityScore: 80,
      citationRatio: 0.5,
      checkedAt: "2026-08-30T00:00:00.000Z",
      engine: "gemini",
      sourceId: "run-1",
    },
  ],
  competitors: [
    {
      competitorId: "c1",
      competitorName: "Rival A",
      competitorDomain: null,
      mentions: 4,
      shareOfVoice: 25,
      avgPosition: 1.5,
      citationRatio: 0.3,
      lastChecked: "2026-08-30T00:00:00.000Z",
      engine: "gemini",
    },
  ],
  engine: "gemini",
};

describe("Module 5.6 report export (2026-09-02 fix for the missing /api/dashboard export routes)", () => {
  describe("buildReportCsv", () => {
    it("quotes fields containing commas or quotes per RFC 4180", () => {
      const csv = buildReportCsv(sampleReport);
      // brandName has both a comma and a quote -> must come out quoted with the quote doubled.
      assert.ok(csv.includes('"Acme, ""The"" Best"'), "brand name field must be RFC4180-quoted");
      assert.ok(csv.includes('"best tool, with a comma"'), "prompt text field must be quoted");
    });

    it("includes every prompt and competitor row, not just a slice", () => {
      const manyPrompts: ReportData = {
        ...sampleReport,
        prompts: Array.from({ length: 12 }, (_, i) => ({
          ...sampleReport.prompts[0],
          id: `p${i}`,
          promptText: `prompt number ${i}`,
        })),
      };
      const csv = buildReportCsv(manyPrompts);
      for (let i = 0; i < 12; i++) {
        assert.ok(
          csv.includes(`prompt number ${i}`),
          `must include prompt ${i}, not just the first 5`,
        );
      }
    });

    it("joins competitor mentions with a separator that survives CSV parsing", () => {
      const csv = buildReportCsv(sampleReport);
      assert.ok(csv.includes("Rival A; Rival B"));
    });
  });

  describe("buildReportPdfLines", () => {
    it("returns plain-text lines covering the overview, every prompt, and every competitor", () => {
      const lines = buildReportPdfLines(sampleReport);
      const joined = lines.join("\n");
      assert.ok(joined.includes("Visibility Score: 42/100"));
      assert.ok(joined.includes("best tool, with a comma"));
      assert.ok(joined.includes("Rival A"));
    });

    it("says so explicitly when there is no prompt or competitor data, rather than an empty section", () => {
      const empty: ReportData = { ...sampleReport, prompts: [], competitors: [] };
      const lines = buildReportPdfLines(empty).join("\n");
      assert.ok(lines.includes("No prompt data for this period."));
      assert.ok(lines.includes("No competitor data for this period."));
    });
  });
});
