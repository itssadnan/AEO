/**
 * Validation schemas for the /api/dashboard/[brandId]/* route handlers
 * (Module 5.6). Per docs/CONVENTIONS.md Section 5.1: "All external input --
 * API request bodies ... -- is validated with a zod schema before use."
 * Query-string params count as external input the same as a JSON body.
 */
import "server-only";
import { z } from "zod";

export const engineParamSchema = z.enum(["gemini", "nvidia-nim"]).default("gemini");

export const periodParamSchema = z.enum(["7d", "30d", "90d"]).default("30d");

export const reportExportRequestSchema = z.object({
  engine: engineParamSchema,
  period: periodParamSchema,
  format: z.enum(["pdf", "csv"]),
});
export type ReportExportRequest = z.infer<typeof reportExportRequestSchema>;

/** Maps a period token to concrete ISO period bounds, ending now. */
export function resolvePeriodBounds(period: z.infer<typeof periodParamSchema>): {
  periodStart: string;
  periodEnd: string;
} {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000);
  return { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
}
