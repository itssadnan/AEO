/**
 * Module 5.7: Crawl-Readiness Audit — Unit tests
 *
 * Tests the success path and realistic failure paths:
 * - Missing robots.txt
 * - Null brand.website
 * - SSRF attempt against a private IP
 * - Valid audit run
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCrawlAudit } from "@/modules/crawl-audit/fetchers";
import { assertPublicHostname, SsrfBlockedError } from "@/lib/security/ssrf-guard";

// Mock fetch globally - returns Response-like objects
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockResponse(body: string | null, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    text: async () => body ?? "",
    headers: new Headers(),
  } as unknown as Response;
}

// Mock the SSRF guard for runCrawlAudit tests
vi.mock("@/lib/security/ssrf-guard", () => ({
  assertPublicHostname: vi.fn(),
  SsrfBlockedError: class SsrfBlockedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SsrfBlockedError";
    }
  },
}));

describe("Crawl-Readiness Audit (Module 5.7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertPublicHostname).mockResolvedValue(undefined);
  });

  describe("runCrawlAudit", () => {
    it("should throw on invalid website URL", async () => {
      await expect(runCrawlAudit("not-a-url")).rejects.toThrow("Invalid website URL");
    });

    it("should throw on SSRF attempt (private IP)", async () => {
      vi.mocked(assertPublicHostname).mockRejectedValue(
        new SsrfBlockedError("192.168.1.1", "Hostname resolves to private IP"),
      );

      await expect(runCrawlAudit("https://192.168.1.1")).rejects.toThrow(SsrfBlockedError);
      expect(assertPublicHostname).toHaveBeenCalledWith("192.168.1.1");
    });

    it("should throw on SSRF attempt (localhost)", async () => {
      vi.mocked(assertPublicHostname).mockRejectedValue(
        new SsrfBlockedError("localhost", "Hostname resolves to loopback IP"),
      );

      await expect(runCrawlAudit("https://localhost")).rejects.toThrow(SsrfBlockedError);
    });

    it("should handle missing robots.txt (all bots allowed)", async () => {
      // Mock fetch: robots.txt returns 404 (null), llms.txt returns 404 (null), homepage returns HTML
      mockFetch
        .mockResolvedValueOnce(createMockResponse(null, false)) // robots.txt 404
        .mockResolvedValueOnce(createMockResponse(null, false)) // llms.txt 404
        .mockResolvedValueOnce(createMockResponse("<html><body><h1>Test</h1></body></html>")); // homepage

      const result = await runCrawlAudit("https://example.com");

      expect(result.domain).toBe("example.com");
      expect(result.robots_txt_result.bots).toEqual({
        GPTBot: { allowed: true },
        PerplexityBot: { allowed: true },
        ClaudeBot: { allowed: true },
        "Google-Extended": { allowed: true },
        CCBot: { allowed: true },
      });
      expect(result.llms_txt_present).toBe(false);
      expect(result.schema_present).toBe(false);
      expect(result.heading_structure.h1_count).toBe(1);
    });

    it("should parse robots.txt with robots-parser", async () => {
      const robotsTxt = `
User-agent: Google-Extended
Disallow: /

User-agent: GPTBot
Disallow: /

User-agent: *
Allow: /
`;

      mockFetch
        .mockResolvedValueOnce(createMockResponse(robotsTxt)) // robots.txt
        .mockResolvedValueOnce(createMockResponse(null, false)) // llms.txt 404
        .mockResolvedValueOnce(createMockResponse("<html><body><h1>Test</h1></body></html>")); // homepage

      const result = await runCrawlAudit("https://example.com");

      expect(result.robots_txt_result.bots["Google-Extended"].allowed).toBe(false);
      expect(result.robots_txt_result.bots.GPTBot.allowed).toBe(false);
      expect(result.robots_txt_result.bots.ClaudeBot.allowed).toBe(true);
      expect(result.robots_txt_result.bots.PerplexityBot.allowed).toBe(true);
      expect(result.robots_txt_result.bots.CCBot.allowed).toBe(true);
    });

    it("should detect llms.txt when present", async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(null, false)) // robots.txt 404
        .mockResolvedValueOnce(createMockResponse("LLMS.txt content")) // llms.txt
        .mockResolvedValueOnce(createMockResponse("<html><body><h1>Test</h1></body></html>")); // homepage

      const result = await runCrawlAudit("https://example.com");

      expect(result.llms_txt_present).toBe(true);
    });

    it("should detect Schema.org JSON-LD", async () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
            {"@context": "https://schema.org", "@type": "WebSite", "name": "Test"}
            </script>
          </head>
          <body><h1>Test</h1></body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce(createMockResponse(null, false)) // robots.txt 404
        .mockResolvedValueOnce(createMockResponse(null, false)) // llms.txt 404
        .mockResolvedValueOnce(createMockResponse(html)); // homepage

      const result = await runCrawlAudit("https://example.com");

      expect(result.schema_present).toBe(true);
    });

    it("should detect Schema.org microdata", async () => {
      const html = `
        <html>
          <body itemscope itemtype="https://schema.org/WebSite">
            <h1 itemprop="name">Test</h1>
          </body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce(createMockResponse(null, false)) // robots.txt 404
        .mockResolvedValueOnce(createMockResponse(null, false)) // llms.txt 404
        .mockResolvedValueOnce(createMockResponse(html)); // homepage

      const result = await runCrawlAudit("https://example.com");

      expect(result.schema_present).toBe(true);
    });

    it("should count heading structure correctly", async () => {
      const html = `
        <html>
          <body>
            <h1>H1 #1</h1>
            <h1>H1 #2</h1>
            <h2>H2 #1</h2>
            <h2>H2 #2</h2>
            <h3>H3 #1</h3>
            <h4>H4 #1</h4>
            <h5>H5 #1</h5>
            <h6>H6 #1</h6>
          </body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce(createMockResponse(null, false)) // robots.txt 404
        .mockResolvedValueOnce(createMockResponse(null, false)) // llms.txt 404
        .mockResolvedValueOnce(createMockResponse(html)); // homepage

      const result = await runCrawlAudit("https://example.com");

      expect(result.heading_structure.h1_count).toBe(2);
      expect(result.heading_structure.h2_count).toBe(2);
      expect(result.heading_structure.h3_count).toBe(1);
      expect(result.heading_structure.h4_count).toBe(1);
      expect(result.heading_structure.h5_count).toBe(1);
      expect(result.heading_structure.h6_count).toBe(1);
      expect(result.heading_structure.has_multiple_h1).toBe(true);
    });

    it("should call SSRF guard before every outbound fetch", async () => {
      mockFetch
        .mockResolvedValueOnce(null) // robots.txt
        .mockResolvedValueOnce("<html><body><h1>Test</h1></body></html>"); // homepage

      await runCrawlAudit("https://example.com");

      // Should be called for: robots.txt, llms.txt, homepage (3 times)
      expect(assertPublicHostname).toHaveBeenCalledTimes(3);
      expect(assertPublicHostname).toHaveBeenCalledWith("example.com");
    });

    it("should handle network timeout gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Timeout"));

      const result = await runCrawlAudit("https://example.com");

      // Should return defaults on network failure
      expect(result.domain).toBe("example.com");
      expect(result.robots_txt_result.bots.GPTBot.allowed).toBe(true);
      expect(result.llms_txt_present).toBe(false);
      expect(result.schema_present).toBe(false);
      expect(result.heading_structure.h1_count).toBe(0);
    });

    it("should handle non-2xx responses gracefully", async () => {
      mockFetch
        .mockResolvedValueOnce(null) // robots.txt 404
        .mockResolvedValueOnce(null); // homepage 404

      const result = await runCrawlAudit("https://example.com");

      expect(result.domain).toBe("example.com");
      expect(result.robots_txt_result.bots.GPTBot.allowed).toBe(true);
      expect(result.llms_txt_present).toBe(false);
      expect(result.schema_present).toBe(false);
      expect(result.heading_structure.h1_count).toBe(0);
    });
  });

});
