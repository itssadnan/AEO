/**
 * Module 5.9 — Razorpay webhook signature verification.
 *
 * Pure function, deliberately dependency-free beyond Node's built-in
 * `node:crypto`, so it has real unit-test coverage without needing to mock
 * Next.js request objects (tests/unit/billing-webhook-verify.test.ts).
 *
 * Per Razorpay's documented scheme
 * (https://razorpay.com/docs/webhooks/validate-test/#validation-flow):
 * the signature is an HMAC-SHA256 of the *raw, unparsed* request body,
 * keyed by the webhook secret configured in the Razorpay dashboard, sent as
 * the `X-Razorpay-Signature` header, hex-encoded. Compared with a
 * constant-time compare per docs/CONVENTIONS.md Section 6 and this module's
 * own security note, so response timing can't leak how many leading bytes
 * matched.
 *
 * `server-only` guards this even though it has no secrets of its own,
 * because it imports `node:crypto` -- an accidental client-bundle import
 * (e.g. transitively through modules/billing's barrel) would otherwise fail
 * obscurely at build time instead of with a clear message. Same lesson as
 * Module 5.7's barrel-bypass fix (see settings-view.tsx's import comment).
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  webhookSecret: string,
): boolean {
  if (!signatureHeader || !webhookSecret) return false;

  const expectedHex = createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");

  const expectedBuf = Buffer.from(expectedHex, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");

  // timingSafeEqual throws on length mismatch rather than returning false --
  // guard explicitly so a short/malformed header can't crash the route.
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
