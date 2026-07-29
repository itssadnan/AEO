"use client";

import type { ErrorLogEntry, KeySlot } from "@/modules/admin";

interface ErrorLogSectionProps {
  errorLog: ErrorLogEntry[];
}

export function ErrorLogSection({ errorLog }: ErrorLogSectionProps) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Error / Failure Log</h2>
      <p className="text-sm text-gray-500 mb-6">
        Most recent 50 failed check runs, newest first.
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Provider
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Key Slot
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Job ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Error Code
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Retryable
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {errorLog.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                  {entry.provider.replace("_", " ")}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {entry.keySlot ? entry.keySlot : "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 font-mono text-xs">
                  {entry.jobId ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">{entry.errorCode}</td>
                <td className="px-4 py-3 text-sm">
                  {entry.retryable ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Yes
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      No
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {errorLog.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
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