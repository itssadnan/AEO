// app/src/modules/admin/quota-caps.ts
// Per docs/CONVENTIONS.md Section 6.4 (spec docx): "build the throttling
// logic to be limit-agnostic, reading current caps rather than hard-coding
// today's numbers" -- these are DISPLAY-ONLY reference thresholds for the
// admin UI's own judgment ("are we close to the cap"), not enforced
// anywhere in the actual request path (5.3 already handles real
// throttling independently). Providers change these without notice
// (the spec docx notes a real 50-80% cut in Dec 2025) -- if these look
// wrong, update this file, don't chase down every place a number might be
// hardcoded, because there is only this one place.
export const KNOWN_FREE_TIER_CAPS: Record<string, { rpm: number; rpd: number | null }> = {
  "gemini-3.5-flash-lite": { rpm: 15, rpd: 1000 }, // approximate -- carried over from the 2.5 family's published caps per spec Section 6.1; not yet independently reconfirmed for 3.5. Say this in your report, do not present it as verified.
  "nvidia_nim_default": { rpm: 40, rpd: null }, // NVIDIA NIM: ~40 rpm free, no published daily cap; a free 200rpm upgrade is available on request (spec Section 6.2)
};

/**
 * Returns true if the current request count is at or above 80% of the RPM cap.
 * Returns false if cap is null/undefined (no cap known) or count is below 80%.
 */
export function isNearCap(count: number, cap: number | null): boolean {
  if (cap === null || cap === undefined) return false;
  return count >= cap * 0.8;
}
