import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSimpleTextPdf } from "../../src/lib/pdf/simple-pdf.ts";

/**
 * Structural checks for the hand-written PDF writer (built instead of
 * adding a PDF dependency -- see that file's doc-comment). The failure mode
 * this guards against is a hand-computed byte offset drifting out of sync
 * with the real content, which produces a PDF that *looks* plausible as
 * text but a real PDF viewer would refuse to open -- so these tests parse
 * the xref table back out and confirm every offset actually lands on the
 * object it claims to.
 */
describe("buildSimpleTextPdf", () => {
  it("produces a well-formed single-page PDF: header, EOF, and xref offsets that really point at each object", () => {
    const pdf = buildSimpleTextPdf(["Report Title", "", "Line two", "Line three"]);
    const text = pdf.toString("latin1");

    assert.ok(text.startsWith("%PDF-1.4\n"), "must start with the PDF header");
    assert.ok(text.trimEnd().endsWith("%%EOF"), "must end with %%EOF");

    const xrefOffsetMatch = text.match(/startxref\n(\d+)\n%%EOF/);
    assert.ok(xrefOffsetMatch, "must have a startxref pointer");
    const xrefOffset = Number(xrefOffsetMatch![1]);
    assert.equal(
      text.slice(xrefOffset, xrefOffset + 4),
      "xref",
      "startxref must point at the byte where the xref table actually starts",
    );

    // Parse "0000000123 00000 n " entries (skip the free-list head "f").
    const entryPattern = /(\d{10}) 00000 n \n/g;
    const objectOffsets: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = entryPattern.exec(text)) !== null) {
      objectOffsets.push(Number(match[1]));
    }
    assert.ok(objectOffsets.length >= 5, "expects at least Catalog/Pages/Font/Page/Contents");

    objectOffsets.forEach((offset, idx) => {
      const objNum = idx + 1;
      const expected = `${objNum} 0 obj`;
      assert.equal(
        text.slice(offset, offset + expected.length),
        expected,
        `xref entry for object ${objNum} must point exactly at its "N 0 obj" marker`,
      );
    });

    // The declared /Length of the (only) content stream must match its real
    // byte length, or PDF viewers will truncate/garble the rendered text.
    const streamMatch = text.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
    assert.ok(streamMatch, "must contain a content stream");
    const declaredLength = Number(streamMatch![1]);
    const actualLength = Buffer.byteLength(streamMatch![2], "latin1");
    assert.equal(declaredLength, actualLength, "declared stream /Length must match actual bytes");
  });

  it("escapes parentheses and backslashes in text so the PDF string literal stays valid", () => {
    const pdf = buildSimpleTextPdf(["Prompt: best (accounts) receivable \\ software"]);
    const text = pdf.toString("latin1");
    assert.ok(
      text.includes("best \\(accounts\\) receivable \\\\ software"),
      "parens and backslash must be backslash-escaped inside the PDF string literal",
    );
  });

  it("paginates long content across multiple Page objects instead of overflowing one page", () => {
    const manyLines = Array.from({ length: 120 }, (_, i) => `Line ${i}`);
    const pdf = buildSimpleTextPdf(manyLines);
    const text = pdf.toString("latin1");
    const pageCountMatch = text.match(/\/Type \/Pages \/Kids \[([^\]]*)\] \/Count (\d+)/);
    assert.ok(pageCountMatch, "must have a Pages object");
    const declaredCount = Number(pageCountMatch![2]);
    assert.ok(declaredCount > 1, "120 lines must not fit on a single page");
    const kidsListed = pageCountMatch![1]
      .trim()
      .split(/\s+/)
      .filter((t) => t === "R").length;
    assert.equal(kidsListed, declaredCount, "Kids array must list exactly Count page references");
  });

  it("never produces zero pages, even for empty input", () => {
    const pdf = buildSimpleTextPdf([]);
    const text = pdf.toString("latin1");
    assert.ok(text.includes("/Count 1"), "empty input still yields one blank page, not zero");
  });
});
