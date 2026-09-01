"use client";

/**
 * Explains *why* a page is showing zero/empty metrics when a real check is
 * queued or mid-retry, instead of letting bare zeros look like either a
 * genuinely bad score or an untried feature. Added 2026-09-01 -- see
 * EmptyStateConfig's doc-comment (modules/dashboard/types.ts) for the full
 * story behind hasPendingChecks/mostRecentPendingErrorCode, and the user
 * report this was built to fix (Reports/Overview/Prompt Explorer all
 * showing indistinguishable zeros with "not sure what can I do with that
 * data").
 *
 * Renders nothing when there's no pending job to explain -- safe to mount
 * unconditionally; callers don't need their own `hasPendingChecks &&` guard.
 */
export function PendingChecksNotice({
  hasPendingChecks,
  mostRecentPendingErrorCode,
  className = "",
}: {
  hasPendingChecks: boolean;
  mostRecentPendingErrorCode: string | null;
  className?: string;
}) {
  if (!hasPendingChecks) return null;

  const isRateLimited = mostRecentPendingErrorCode === "rate_limited";

  return (
    <div
      className={`p-4 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-sm text-[var(--color-text-primary)] ${className}`}
      role="status"
    >
      <p className="font-medium">
        {isRateLimited
          ? "A visibility check is queued but rate-limited by the AI provider right now"
          : "A visibility check is queued and hasn't completed yet"}
      </p>
      <p className="text-[var(--color-text-secondary)] mt-1">
        {isRateLimited
          ? "This is a live provider quota limit, not a bug — the background worker retries automatically. The numbers below are placeholders, not a real (or bad) result yet."
          : "The background worker hasn't picked it up yet. The numbers below are placeholders, not a real (or bad) result yet."}
      </p>
    </div>
  );
}
