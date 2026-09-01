"use client";

import type { ErrorLogEntry, KeySlot } from "@/modules/admin";
import { Badge } from "@/components/ui/badge";

interface ErrorLogSectionProps {
  errorLog: ErrorLogEntry[];
}

// Restyled onto the shared design system (Module 5.6) 2026-09-01 — all
// data below unchanged, only markup/classes touched.
export function ErrorLogSection({ errorLog }: ErrorLogSectionProps) {
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-6">
      <h2 className="mb-1 text-xl font-semibold text-text-primary">Error / Failure Log</h2>
      <p className="mb-6 text-sm text-text-secondary">
        Most recent 50 failed check runs, newest first.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Provider
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Key Slot
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Job ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Error Code
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Retryable
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {errorLog.map((entry) => (
              <tr key={entry.id} className="hover:bg-surface-2/50 transition-colors">
                <td className="px-4 py-3 text-sm text-text-primary">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary capitalize">
                  {entry.provider.replace("_", " ")}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary">
                  {entry.keySlot ? entry.keySlot : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-text-primary">
                  {entry.jobId ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary">{entry.errorCode}</td>
                <td className="px-4 py-3 text-sm">
                  {entry.retryable ? (
                    <Badge tone="warning">Yes</Badge>
                  ) : (
                    <Badge tone="negative">No</Badge>
                  )}
                </td>
              </tr>
            ))}
            {errorLog.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-tertiary">
                  No error logs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
