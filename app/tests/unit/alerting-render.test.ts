import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  renderDigestEmail,
  renderThresholdAlertEmail,
} from "../../src/modules/alerting/render.ts";

describe("Module 5.8 — Alerting & Reporting: email rendering", () => {
  describe("escapeHtml", () => {
    it("escapes all five HTML-significant characters", () => {
      assert.equal(
        escapeHtml(`<script>alert('x')</script> & "quoted"`),
        "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;",
      );
    });
  });

  describe("renderDigestEmail", () => {
    it("reports an upward score change with new and lost mentions", () => {
      const { subject, text, html } = renderDigestEmail({
        brand_name: "Acme Corp",
        current_score: 70,
        prior_score: 55,
        score_change: 15,
        new_mentions: [{ prompt_id: "p1", prompt_text: "best CRM for small teams" }],
        lost_mentions: [{ prompt_id: "p2", prompt_text: "top project management tools" }],
        crawl_issues: [],
      });

      assert.equal(subject, "Your weekly AEO Visibility digest: Acme Corp");
      assert.ok(text.includes("Visibility Score: 70 (up 15 points)"));
      assert.ok(text.includes('+ New mention: "best CRM for small teams"'));
      assert.ok(text.includes('- Lost mention: "top project management tools"'));
      assert.ok(html.includes("up 15 points"));
    });

    it("reports a downward score change", () => {
      const { text } = renderDigestEmail({
        brand_name: "Acme Corp",
        current_score: 40,
        prior_score: 55,
        score_change: -15,
        new_mentions: [],
        lost_mentions: [],
        crawl_issues: [],
      });
      assert.ok(text.includes("Visibility Score: 40 (down 15 points)"));
      assert.ok(text.includes("No mention changes this week."));
    });

    it("labels a brand's first-ever week (no prior snapshot) instead of a misleading 0-point change", () => {
      const { text } = renderDigestEmail({
        brand_name: "Acme Corp",
        current_score: 60,
        prior_score: null,
        score_change: 0,
        new_mentions: [],
        lost_mentions: [],
        crawl_issues: [],
      });
      assert.ok(text.includes("Visibility Score: 60 (unchanged, first week with data)"));
    });

    it("translates crawl issue codes to readable labels, including the bot name for bot_disallowed", () => {
      const { text } = renderDigestEmail({
        brand_name: "Acme Corp",
        current_score: 60,
        prior_score: 60,
        score_change: 0,
        new_mentions: [],
        lost_mentions: [],
        crawl_issues: [
          { issue: "missing_schema_markup" },
          { issue: "missing_h1" },
          { issue: "bot_disallowed", bot: "GPTBot" },
        ],
      });
      assert.ok(text.includes("- Missing schema.org structured data"));
      assert.ok(text.includes("- Missing an H1 heading"));
      assert.ok(text.includes("- An AI crawler is disallowed in robots.txt (GPTBot)"));
    });

    it("falls back to the raw issue code for an unrecognized crawl issue type", () => {
      const { text } = renderDigestEmail({
        brand_name: "Acme Corp",
        current_score: 60,
        prior_score: 60,
        score_change: 0,
        new_mentions: [],
        lost_mentions: [],
        crawl_issues: [{ issue: "some_future_issue_type" }],
      });
      assert.ok(text.includes("- some_future_issue_type"));
    });

    it("HTML-escapes user-entered brand name and prompt text (untrusted content, docs/CONVENTIONS.md Section 6)", () => {
      const { html } = renderDigestEmail({
        brand_name: `<img src=x onerror=alert(1)>`,
        current_score: 50,
        prior_score: 50,
        score_change: 0,
        new_mentions: [{ prompt_id: "p1", prompt_text: `"><script>alert(2)</script>` }],
        lost_mentions: [],
        crawl_issues: [],
      });
      assert.ok(!html.includes("<img src=x onerror=alert(1)>"));
      assert.ok(!html.includes("<script>alert(2)</script>"));
      assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
      assert.ok(html.includes("&lt;script&gt;alert(2)&lt;/script&gt;"));
    });
  });

  describe("renderThresholdAlertEmail", () => {
    it("names the competitor and the prompt it was newly cited on", () => {
      const { subject, text } = renderThresholdAlertEmail({
        brand_name: "Acme Corp",
        competitor_name: "RivalCo",
        prompt_text: "best CRM for small teams",
        checked_at: "2026-07-30T12:00:00Z",
      });
      assert.equal(subject, "RivalCo newly cited where Acme Corp wasn't");
      assert.ok(text.includes("RivalCo was just cited by an AI engine"));
      assert.ok(text.includes('Prompt: "best CRM for small teams"'));
    });

    it("HTML-escapes the competitor name (untrusted, customer-entered)", () => {
      const { html } = renderThresholdAlertEmail({
        brand_name: "Acme Corp",
        competitor_name: `<b>RivalCo</b>`,
        prompt_text: "best CRM",
        checked_at: "2026-07-30T12:00:00Z",
      });
      assert.ok(!html.includes("<b>RivalCo</b>"));
      assert.ok(html.includes("&lt;b&gt;RivalCo&lt;/b&gt;"));
    });
  });
});
