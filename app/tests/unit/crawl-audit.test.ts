/**
 * Module 5.7: Crawl-Readiness Audit — Unit tests
 *
 * Rewritten to use node:test + node:assert/strict, matching this project's
 * actual test runner (see package.json's "test" script: `tsx --test
 * tests/unit/*.test.ts`, Node's native test runner — NOT vitest). Earlier
 * versions of this file imported `vi`/`expect` from "vitest", which this
 * runner cannot execute at all (it throws "Vitest failed to access its
 * internal state" immediately) — every prior "12/12 tests pass" claim from
 * any delegate round was never actually true against the real npm test
 * command, only against a manually-invoked `vitest run` that isn't how this
 * project runs tests. See progress/modules/5.7-crawl-readiness-audit.md
 * decisions log for the full story.
 *
 * Two consequences of the switch:
 * - No `vi.mock()`-style import interception is available. The SSRF guard
 *   (assertPublicHostname) is exercised for REAL here, not mocked — every
 *   hostname used below either fails before any DNS lookup (invalid URL,
 *   localhost, a literal private IP) or is "example.com", a real public
 *   domain that will resolve via a real DNS lookup in any environment with
 *   normal network access. This makes these light integration tests for the
 *   SSRF-guard-adjacent cases, not pure unit tests — an intentional
 *   trade-off given the constraint, not an oversight.
 * - getOrRunCrawlAudit's 24h-cache *decision* is tested via the extracted
 *   pure function `isAuditFresh`, not by calling getOrRunCrawlAudit itself
 *   against a real or mocked Supabase client — this project's unit test
 *   tier has no Supabase-mocking convention (see tests/integration/*-rls.ts
 *   for the pattern this project actually uses for real DB behavior, which
 *   requires a live Supabase project and is skipped otherwise).
 *
 * Tests the success path and realistic failure paths:
 * - Missing robots.txt
 * - Invalid URL / SSRF attempts (localhost, private IP)
 * - buildCrawlChecklist's pass/fail/warning mapping
 * - isAuditFresh's 24h boundary
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { runCrawlAudit } from "../../src/modules/crawl-audit/fetchers.ts";
import { buildCrawlChecklist, isAuditFresh } from "../../src/modules/crawl-audit/crawl-audit.ts";
import type { CrawlAuditRow } from "../../src/modules/crawl-audit/types.ts";
import { SsrfBlockedError } from "../../src/lib/security/ssrf-guard.ts";

/**
 * Minimal manual fetch stub — replaces vi.fn().mockResolvedValueOnce chains.
 *
 * Keyed by URL path suffix (robots.txt / llms.txt / homepage "/"), not call
 * order: runCrawlAudit fetches llms.txt and the homepage concurrently via
 * Promise.all, and since the real (unmocked) SSRF guard does a real DNS
 * lookup before each fetch, the two concurrent calls' actual fetch()
 * invocation order isn't guaranteed to match their Promise.all array
 * order — a positional/FIFO stub can silently hand the homepage's HTML
 * response to the llms.txt call or vice versa. Matching by URL avoids that
 * entirely.
 */
function createFetchStub(byPath: {
  robotsTxt: Response | null;
  llmsTxt: Response | null;
  homepage: Response | null;
}) {
  const calls: string[] = [];
  const stub = async (url: string | URL | Request) => {
    const urlStr = String(url);
    calls.push(urlStr);

    const response = urlStr.endsWith("/robots.txt")
      ? byPath.robotsTxt
      : urlStr.endsWith("/llms.txt")
        ? byPath.llmsTxt
        : byPath.homepage;

    if (response === null) {
      throw new Error("simulated network failure");
    }
    return response;
  };
  return { stub, calls };
}

function createMockResponse(body: string | null, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    text: async () => body ?? "",
    headers: new Headers(),
  } as unknown as Response;
}

function makeAuditRow(overrides: Partial<CrawlAuditRow> = {}): CrawlAuditRow {
  return {
    id: "audit-1",
    brand_id: "brand-1",
    domain: "example.com",
    robots_txt_result: {
      bots: {
        GPTBot: { allowed: true },
        PerplexityBot: { allowed: true },
        ClaudeBot: { allowed: true },
        "Google-Extended": { allowed: true },
        CCBot: { allowed: true },
      },
    },
    llms_txt_present: true,
    schema_present: true,
    heading_structure: {
      h1_count: 1,
      h2_count: 2,
      h3_count: 0,
      h4_count: 0,
      h5_count: 0,
      h6_count: 0,
      has_multiple_h1: false,
    },
    checked_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Crawl-Readiness Audit (Module 5.7)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  describe("runCrawlAudit", () => {
    it("throws on invalid website URL (before any fetch or SSRF check)", async () => {
      await assert.rejects(runCrawlAudit("not-a-url"), /Invalid website URL/);
    });

    it("throws SsrfBlockedError on a literal private IPv4 (no DNS lookup needed)", async () => {
      await assert.rejects(runCrawlAudit("https://192.168.1.1"), SsrfBlockedError);
    });

    it("throws SsrfBlockedError on localhost", async () => {
      await assert.rejects(runCrawlAudit("https://localhost"), SsrfBlockedError);
    });

    it("handles a missing robots.txt as 'all bots allowed', not an error", async () => {
      const { stub } = createFetchStub({
        robotsTxt: createMockResponse(null, false),
        llmsTxt: createMockResponse(null, false),
        homepage: createMockResponse("<html><body><h1>Test</h1></body></html>"),
      });
      globalThis.fetch = stub as typeof globalThis.fetch;

      const result = await runCrawlAudit("https://example.com");

      assert.equal(result.domain, "example.com");
      assert.deepEqual(result.robots_txt_result.bots, {
        GPTBot: { allowed: true },
        PerplexityBot: { allowed: true },
        ClaudeBot: { allowed: true },
        "Google-Extended": { allowed: true },
        CCBot: { allowed: true },
      });
      assert.equal(result.llms_txt_present, false);
      assert.equal(result.schema_present, false);
      assert.equal(result.heading_structure.h1_count, 1);

      globalThis.fetch = originalFetch;
    });

    it("parses robots.txt with robots-parser, disallowing the specific bot named", async () => {
      const robotsTxt = `
User-agent: Google-Extended
Disallow: /

User-agent: GPTBot
Disallow: /

User-agent: *
Allow: /
`;
      const { stub } = createFetchStub({
        robotsTxt: createMockResponse(robotsTxt),
        llmsTxt: createMockResponse(null, false),
        homepage: createMockResponse("<html><body><h1>Test</h1></body></html>"),
      });
      globalThis.fetch = stub as typeof globalThis.fetch;

      const result = await runCrawlAudit("https://example.com");

      assert.equal(result.robots_txt_result.bots["Google-Extended"].allowed, false);
      assert.equal(result.robots_txt_result.bots.GPTBot.allowed, false);
      assert.equal(result.robots_txt_result.bots.ClaudeBot.allowed, true);
      assert.equal(result.robots_txt_result.bots.PerplexityBot.allowed, true);
      assert.equal(result.robots_txt_result.bots.CCBot.allowed, true);

      globalThis.fetch = originalFetch;
    });

    it("detects llms.txt when present", async () => {
      const { stub } = createFetchStub({
        robotsTxt: createMockResponse(null, false),
        llmsTxt: createMockResponse("LLMS.txt content"),
        homepage: createMockResponse("<html><body><h1>Test</h1></body></html>"),
      });
      globalThis.fetch = stub as typeof globalThis.fetch;

      const result = await runCrawlAudit("https://example.com");
      assert.equal(result.llms_txt_present, true);

      globalThis.fetch = originalFetch;
    });

    it("detects Schema.org JSON-LD", async () => {
      const html = `
        <html><head>
          <script type="application/ld+json">
          {"@context": "https://schema.org", "@type": "WebSite", "name": "Test"}
          </script>
        </head><body><h1>Test</h1></body></html>
      `;
      const { stub } = createFetchStub({
        robotsTxt: createMockResponse(null, false),
        llmsTxt: createMockResponse(null, false),
        homepage: createMockResponse(html),
      });
      globalThis.fetch = stub as typeof globalThis.fetch;

      const result = await runCrawlAudit("https://example.com");
      assert.equal(result.schema_present, true);

      globalThis.fetch = originalFetch;
    });

    it("detects Schema.org microdata", async () => {
      const html = `
        <html><body itemscope itemtype="https://schema.org/WebSite">
          <h1 itemprop="name">Test</h1>
        </body></html>
      `;
      const { stub } = createFetchStub({
        robotsTxt: createMockResponse(null, false),
        llmsTxt: createMockResponse(null, false),
        homepage: createMockResponse(html),
      });
      globalThis.fetch = stub as typeof globalThis.fetch;

      const result = await runCrawlAudit("https://example.com");
      assert.equal(result.schema_present, true);

      globalThis.fetch = originalFetch;
    });

    it("counts heading structure correctly", async () => {
      const html = `
        <html><body>
          <h1>H1 #1</h1><h1>H1 #2</h1>
          <h2>H2 #1</h2><h2>H2 #2</h2>
          <h3>H3 #1</h3><h4>H4 #1</h4><h5>H5 #1</h5><h6>H6 #1</h6>
        </body></html>
      `;
      const { stub } = createFetchStub({
        robotsTxt: createMockResponse(null, false),
        llmsTxt: createMockResponse(null, false),
        homepage: createMockResponse(html),
      });
      globalThis.fetch = stub as typeof globalThis.fetch;

      const result = await runCrawlAudit("https://example.com");

      assert.equal(result.heading_structure.h1_count, 2);
      assert.equal(result.heading_structure.h2_count, 2);
      assert.equal(result.heading_structure.h3_count, 1);
      assert.equal(result.heading_structure.h4_count, 1);
      assert.equal(result.heading_structure.h5_count, 1);
      assert.equal(result.heading_structure.h6_count, 1);
      assert.equal(result.heading_structure.has_multiple_h1, true);

      globalThis.fetch = originalFetch;
    });

    it("calls fetch exactly 3 times per audit (robots.txt, llms.txt, homepage)", async () => {
      const { stub, calls } = createFetchStub({
        robotsTxt: createMockResponse(null, false),
        llmsTxt: createMockResponse(null, false),
        homepage: createMockResponse("<html><body><h1>Test</h1></body></html>"),
      });
      globalThis.fetch = stub as typeof globalThis.fetch;

      await runCrawlAudit("https://example.com");

      assert.equal(calls.length, 3);
      for (const url of calls) {
        assert.ok(url.startsWith("https://example.com/"), `unexpected fetch URL: ${url}`);
      }

      globalThis.fetch = originalFetch;
    });

    it("handles a network failure on every fetch gracefully (no unhandled rejection)", async () => {
      const { stub } = createFetchStub({ robotsTxt: null, llmsTxt: null, homepage: null });
      globalThis.fetch = stub as typeof globalThis.fetch;

      const result = await runCrawlAudit("https://example.com");

      assert.equal(result.domain, "example.com");
      assert.equal(result.robots_txt_result.bots.GPTBot.allowed, true);
      assert.equal(result.llms_txt_present, false);
      assert.equal(result.schema_present, false);
      assert.equal(result.heading_structure.h1_count, 0);

      globalThis.fetch = originalFetch;
    });

    it("handles non-2xx responses gracefully", async () => {
      const { stub } = createFetchStub({
        robotsTxt: createMockResponse(null, false),
        llmsTxt: createMockResponse(null, false),
        homepage: createMockResponse(null, false),
      });
      globalThis.fetch = stub as typeof globalThis.fetch;

      const result = await runCrawlAudit("https://example.com");

      assert.equal(result.domain, "example.com");
      assert.equal(result.robots_txt_result.bots.GPTBot.allowed, true);
      assert.equal(result.llms_txt_present, false);
      assert.equal(result.schema_present, false);
      assert.equal(result.heading_structure.h1_count, 0);

      globalThis.fetch = originalFetch;
    });
  });

  describe("isAuditFresh (24h cache decision)", () => {
    it("is fresh when checked less than 24h ago", () => {
      const now = new Date("2026-07-27T12:00:00.000Z");
      const checkedAt = new Date("2026-07-27T00:00:01.000Z").toISOString(); // ~12h ago
      assert.equal(isAuditFresh(checkedAt, now), true);
    });

    it("is stale when checked more than 24h ago", () => {
      const now = new Date("2026-07-27T12:00:00.000Z");
      const checkedAt = new Date("2026-07-26T11:00:00.000Z").toISOString(); // 25h ago
      assert.equal(isAuditFresh(checkedAt, now), false);
    });

    it("is stale at exactly 24h (boundary is exclusive)", () => {
      const now = new Date("2026-07-27T12:00:00.000Z");
      const checkedAt = new Date("2026-07-26T12:00:00.000Z").toISOString(); // exactly 24h ago
      assert.equal(isAuditFresh(checkedAt, now), false);
    });
  });

  describe("buildCrawlChecklist", () => {
    it("marks every item pass for a fully-passing audit", () => {
      const items = buildCrawlChecklist(makeAuditRow());
      assert.ok(items.length > 0);
      for (const item of items) {
        assert.equal(item.status, "pass", `expected ${item.id} to pass`);
      }
    });

    it("fails only the specific bot that robots.txt blocks", () => {
      const audit = makeAuditRow({
        robots_txt_result: {
          bots: {
            GPTBot: { allowed: false },
            PerplexityBot: { allowed: true },
            ClaudeBot: { allowed: true },
            "Google-Extended": { allowed: true },
            CCBot: { allowed: true },
          },
        },
      });

      const items = buildCrawlChecklist(audit);
      const gptItem = items.find((i) => i.id === "robots-GPTBot");
      const perplexityItem = items.find((i) => i.id === "robots-PerplexityBot");

      assert.equal(gptItem?.status, "fail");
      assert.equal(perplexityItem?.status, "pass");
    });

    it("never marks llms.txt as fail when absent — warning only", () => {
      const audit = makeAuditRow({ llms_txt_present: false });
      const items = buildCrawlChecklist(audit);
      const llmsItem = items.find((i) => i.id === "llms-txt");

      assert.equal(llmsItem?.status, "warning");
      assert.notEqual(llmsItem?.status, "fail");
    });

    it("warns (not fails) on zero or multiple H1 tags", () => {
      const zeroH1 = buildCrawlChecklist(
        makeAuditRow({
          heading_structure: {
            h1_count: 0,
            h2_count: 1,
            h3_count: 0,
            h4_count: 0,
            h5_count: 0,
            h6_count: 0,
            has_multiple_h1: false,
          },
        }),
      );
      const multipleH1 = buildCrawlChecklist(
        makeAuditRow({
          heading_structure: {
            h1_count: 2,
            h2_count: 1,
            h3_count: 0,
            h4_count: 0,
            h5_count: 0,
            h6_count: 0,
            has_multiple_h1: true,
          },
        }),
      );

      assert.equal(zeroH1.find((i) => i.id === "heading-structure")?.status, "warning");
      assert.equal(multipleH1.find((i) => i.id === "heading-structure")?.status, "warning");
    });
  });
});
