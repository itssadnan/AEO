"use client";

import type { KeyHealthRow, ProviderName, KeySlot } from "@/modules/admin";
import { clearDeadKeyAction } from "@/modules/admin/actions";

interface KeyHealthSectionProps {
  keyHealth: KeyHealthRow[];
}

export function KeyHealthSection({ keyHealth }: KeyHealthSectionProps) {
  async function handleClearDeadKey(provider: ProviderName, slot: KeySlot) {
    const result = await clearDeadKeyAction(provider, slot);
    if ("error" in result) {
      alert(`Failed to clear dead key: ${result.error}`);
    } else {
      window.location.reload();
    }
  }

  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Pool Health</h2>
      <p className="text-sm text-gray-500 mb-6">
        Current status of each API key in the pool. Dead keys (401/403) are excluded from the
        failover rotation until manually cleared.
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Provider
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Slot
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Dead Since
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Error
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {keyHealth.map((row) => (
              <tr key={`${row.provider}-${row.keySlot}`} className={row.isDead ? "bg-red-50" : ""}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">
                  {row.provider.replace("_", " ")}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 capitalize">{row.keySlot}</td>
                <td className="px-4 py-3 text-sm">
                  {row.isDead ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      Dead
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Alive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {row.deadAt ? new Date(row.deadAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">{row.lastErrorCode ?? "—"}</td>
                <td className="px-4 py-3 text-sm">
                  {row.isDead && (
                    <button
                      onClick={() => handleClearDeadKey(row.provider, row.keySlot)}
                      className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                    >
                      Clear dead flag
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}