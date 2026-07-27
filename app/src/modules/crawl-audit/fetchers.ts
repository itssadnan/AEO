/**
 * Module 5.7: Crawl-Readiness Audit — HTTP fetchers with SSRF guard
 *
 * All outbound fetches go through assertPublicHostname before the request.
 * Uses robots-parser (npm) for robots.txt parsing — no hand-rolled parser.
 */
import { assertPublicHostname } from "@/lib/security";
import type { RobotsTxtResult, HeadingStructureResult } from "./schemas";
import { robotsTxtResultSchema, headingStructureResultSchema } from "./schemas";
import { AUDITED_BOTS } from "./types";

const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_SIZE = 500_000; // 500 KB cap on response bodies

/**
 * Fetches a URL with timeout, size limit, and SSRF guard.
 * Returns null on network error / timeout / non-2xx / size exceeded.
 * SSRF guard is called before every outbound fetch.
 */
async function safeFetch(url: string): Promise<string | null> {
  const hostname = extractHostname(url);
  if (!hostname) return null;

  // SSRF guard — must be called before EVERY outbound fetch
  await assertPublicHostname(hostname);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "AEO-CrawlAudit/1.0 (+https://aeo.example.com/bot)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) return null;

    // Enforce body size limit
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return null;
    }

    const text = await res.text();
    if (text.length > MAX_BODY_SIZE) return null;

    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extracts the hostname from a URL string, normalizing it (lowercase, no port).
 * Returns null if the URL is invalid.
 */
function extractHostname(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Parses robots.txt using the robots-parser npm package.
 * Returns a RobotsTxtResult with per-bot allow/block status.
 */
async function parseRobotsTxt(robotsTxt: string, domain: string): Promise<RobotsTxtResult> {
  // Dynamic import to avoid bundling issues in edge runtime
  const robotsParser = (await import("robots-parser")).default;

  const parser = robotsParser(`https://${domain}/robots.txt`, robotsTxt);

  const bots: RobotsTxtResult["bots"] = {};
  for (const bot of AUDITED_BOTS) {
    // robots-parser's isAllowed returns true/false/undefined (undefined = no rule)
    // We treat undefined as allowed (no explicit disallow)
    const allowed = parser.isAllowed(`https://${domain}/`, bot) ?? true;
    bots[bot] = { allowed };
  }

  return { bots };
}


/**
 * Runs the full crawl-readiness audit for a given brand website URL.
 * Returns a validated CrawlAuditInsert payload, or throws on SSRF / validation failure.
 * Makes exactly 3 outbound fetches: robots.txt, llms.txt, homepage (once for both schema.org and headings).
 */
export async function runCrawlAudit(websiteUrl: string): Promise<{
  domain: string;
  robots_txt_result: RobotsTxtResult;
  llms_txt_present: boolean;
  schema_present: boolean;
  heading_structure: HeadingStructureResult;
}> {
  const hostname = extractHostname(websiteUrl);
  if (!hostname) {
    throw new Error("Invalid website URL");
  }

  // Fetch robots.txt (safeFetch calls SSRF guard internally)
  const robotsTxt = await safeFetch(`https://${hostname}/robots.txt`);
  const robots_txt_result = robotsTxt
    ? await parseRobotsTxt(robotsTxt, hostname)
    : { bots: Object.fromEntries(AUDITED_BOTS.map((b) => [b, { allowed: true }])) }; // no robots.txt = all allowed

  // Validate the parsed result
  const validatedRobots = robotsTxtResultSchema.parse(robots_txt_result);

  // Fetch llms.txt and homepage in parallel (safeFetch calls SSRF guard for each)
  const [llmsTxt, homepageHtml] = await Promise.all([
    safeFetch(`https://${hostname}/llms.txt`),
    safeFetch(`https://${hostname}/`),
  ]);

  const llms_txt_present = llmsTxt !== null && llmsTxt.trim().length > 0;

  // Check schema.org and heading structure from the same homepage HTML
  let schema_present = false;
  let heading_structure: HeadingStructureResult = {
    h1_count: 0,
    h2_count: 0,
    h3_count: 0,
    h4_count: 0,
    h5_count: 0,
    h6_count: 0,
    has_multiple_h1: false,
  };

  if (homepageHtml) {
    // Check for Schema.org (JSON-LD or microdata)
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = jsonLdRegex.exec(homepageHtml)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const contexts = Array.isArray(data["@context"]) ? data["@context"] : [data["@context"]];
        if (contexts.some((c: unknown) => typeof c === "string" && c.includes("schema.org"))) {
          schema_present = true;
          break;
        }
      } catch {
        // Ignore malformed JSON-LD
      }
    }

    // Check for microdata if JSON-LD not found
    if (!schema_present) {
      const microdataRegex = /itemscope[^>]*itemtype=["'][^"']*schema\.org[^"']*["']/i;
      if (microdataRegex.test(homepageHtml)) {
        schema_present = true;
      }
    }

    // Analyze heading structure
    const counts: HeadingStructureResult = {
      h1_count: 0,
      h2_count: 0,
      h3_count: 0,
      h4_count: 0,
      h5_count: 0,
      h6_count: 0,
      has_multiple_h1: false,
    };

    for (let i = 1; i <= 6; i++) {
      const regex = new RegExp(`<h${i}[^>]*>`, "gi");
      const matches = homepageHtml.match(regex);
      const count = matches ? matches.length : 0;
      const key = `h${i}_count` as keyof HeadingStructureResult;
      if (key !== "has_multiple_h1") {
        (counts as unknown as Record<string, number>)[key] = count;
      }
    }

    counts.has_multiple_h1 = counts.h1_count > 1;
    heading_structure = counts;
  }

  const validatedHeadings = headingStructureResultSchema.parse(heading_structure);

  return {
    domain: hostname,
    robots_txt_result: validatedRobots,
    llms_txt_present,
    schema_present,
    heading_structure: validatedHeadings,
  };
}
