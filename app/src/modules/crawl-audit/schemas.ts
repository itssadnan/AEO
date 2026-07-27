/**
 * Module 5.7: Crawl-Readiness Audit — Zod schemas
 *
 * Every schema here validates untrusted input (brands.website, HTTP response
 * bodies) before the data is used or stored. No bare `any` — every shape is
 * explicitly typed.
 */
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/** The domain we're about to audit — validated before any outbound fetch. */
export const domainSchema = z
  .string()
  .min(1, "Domain is required")
  .max(253, "Domain must be 253 characters or fewer")
  .refine(
    (val) => {
      // Reject URLs — we want a bare hostname, not a full URL
      return !val.includes("://") && !val.startsWith("/");
    },
    { message: "Domain must be a bare hostname, not a URL" },
  );

// ─────────────────────────────────────────────────────────────────────────
// robots.txt response schemas
// ─────────────────────────────────────────────────────────────────────────

/** Per-bot allow/block result. */
export const botResultSchema = z.object({
  allowed: z.boolean(),
});

/** The full parsed robots.txt result — object keyed by bot name. */
export const robotsTxtResultSchema = z.object({
  bots: z.record(z.string(), botResultSchema),
});

export type RobotsTxtResult = z.infer<typeof robotsTxtResultSchema>;

// ─────────────────────────────────────────────────────────────────────────
// llms.txt response schemas
// ─────────────────────────────────────────────────────────────────────────

export const llmsTxtResultSchema = z.object({
  present: z.boolean(),
  error: z.string().nullable(),
});

export type LlmsTxtResult = z.infer<typeof llmsTxtResultSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Heading structure schemas
// ─────────────────────────────────────────────────────────────────────────

export const headingStructureResultSchema = z.object({
  h1_count: z.number().int().min(0),
  h2_count: z.number().int().min(0),
  h3_count: z.number().int().min(0),
  h4_count: z.number().int().min(0),
  h5_count: z.number().int().min(0),
  h6_count: z.number().int().min(0),
  has_multiple_h1: z.boolean(),
});

export type HeadingStructureResult = z.infer<typeof headingStructureResultSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Combined audit result
// ─────────────────────────────────────────────────────────────────────────

export const crawlAuditResultSchema = z.object({
  domain: z.string(),
  robots_txt_result: robotsTxtResultSchema,
  llms_txt_present: z.boolean(),
  schema_present: z.boolean(),
  heading_structure: headingStructureResultSchema,
  checked_at: z.string(),
});

export type CrawlAuditResult = z.infer<typeof crawlAuditResultSchema>;
