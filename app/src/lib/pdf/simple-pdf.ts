/**
 * Minimal, dependency-free PDF writer for plain-text, single-font reports.
 *
 * Built instead of adding a PDF library: this project's existing convention
 * (docs/CONVENTIONS.md, see razorpay-client.ts's doc-comment for the same
 * reasoning applied to a REST API) is to prefer a small amount of directly-
 * written code over a new dependency when the real requirement is narrow --
 * here, "export a readable multi-page text report as a PDF", not general
 * PDF authoring (no images, no embedded fonts, no complex layout).
 *
 * Produces a valid PDF 1.4 document: one Catalog, one Pages tree, one Page
 * + one Contents stream per output page, and Helvetica as a *standard* 14
 * font (Type1, no embedding needed -- every PDF viewer ships it). Byte
 * offsets in the xref table are computed by tracking the running length of
 * the buffer as each object is appended, never by hand -- the classic way
 * this kind of hand-written PDF ends up subtly corrupt is a manually
 * counted/copy-pasted offset drifting out of sync with the real content.
 */
import "server-only"; // Uses Node's Buffer -- never bundle this into client code.

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const FONT_SIZE = 10;
const LINE_HEIGHT = 14;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LINE_HEIGHT);

/** Escapes a string for use inside a PDF literal string, i.e. `(...)`. */
function escapePdfText(text: string): string {
  // PDF's base Helvetica (WinAnsiEncoding) only reliably covers Latin-1;
  // replace anything outside it rather than risk emitting bytes the
  // encoding can't represent. Backslash/parens must be escaped per the PDF
  // spec (ISO 32000-1 Section 7.3.4.2) since they're the string delimiters.
  return text
    .replace(/[^\x20-\x7e]/g, (ch) => (ch.codePointAt(0)! <= 0xff ? ch : "?"))
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Wraps a line to `maxChars`, breaking on whitespace where possible. */
function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const words = line.split(" ");
  const wrapped: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      wrapped.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) wrapped.push(current);
  return wrapped.length > 0 ? wrapped : [""];
}

/**
 * Builds a valid multi-page PDF from plain text lines (empty string = blank
 * line). Returns a Buffer ready to send as `application/pdf`.
 */
export function buildSimpleTextPdf(lines: string[]): Buffer {
  const maxCharsPerLine = Math.floor((PAGE_WIDTH - 2 * MARGIN) / (FONT_SIZE * 0.5));
  const wrapped = lines.flatMap((line) => wrapLine(line, maxCharsPerLine));
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += LINES_PER_PAGE) {
    pages.push(wrapped.slice(i, i + LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push([""]);

  const pageCount = pages.length;
  // Object numbering: 1 = Catalog, 2 = Pages, 3 = Font, then for each page
  // i (0-indexed): (4 + 2*i) = Page object, (5 + 2*i) = its Contents stream.
  const fontObjNum = 3;
  const pageObjNum = (i: number) => 4 + 2 * i;
  const contentObjNum = (i: number) => 5 + 2 * i;
  const totalObjects = 3 + pageCount * 2;

  const kids = pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(" ");

  const objects: string[] = [];
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
  objects[fontObjNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  pages.forEach((pageLines, i) => {
    objects[pageObjNum(i)] =
      `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> ` +
      `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentObjNum(i)} 0 R >>`;

    const startY = PAGE_HEIGHT - MARGIN;
    const streamParts = [
      "BT",
      `/F1 ${FONT_SIZE} Tf`,
      `${LINE_HEIGHT} TL`,
      `${MARGIN} ${startY} Td`,
      ...pageLines.map((line, idx) =>
        idx === 0 ? `(${escapePdfText(line)}) Tj` : `T*\n(${escapePdfText(line)}) Tj`,
      ),
      "ET",
    ];
    const stream = streamParts.join("\n");
    const streamBytes = Buffer.byteLength(stream, "latin1");
    objects[contentObjNum(i)] = `<< /Length ${streamBytes} >>\nstream\n${stream}\nendstream`;
  });

  // Assemble the file, tracking each object's byte offset as we go -- never
  // computed by hand, always from the actual running buffer length.
  let body = "%PDF-1.4\n";
  const offsets: number[] = new Array(totalObjects + 1).fill(0);
  for (let n = 1; n <= totalObjects; n++) {
    offsets[n] = Buffer.byteLength(body, "latin1");
    body += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, "latin1");
  let xref = `xref\n0 ${totalObjects + 1}\n`;
  xref += `0000000000 65535 f \n`;
  for (let n = 1; n <= totalObjects; n++) {
    xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\n` + `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(body + xref + trailer, "latin1");
}
