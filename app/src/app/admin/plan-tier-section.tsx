"use client";

import { useState } from "react";
import type { WorkspaceOverrideRow } from "@/modules/admin";
import { setWorkspacePlanTierAction } from "@/modules/admin/actions";

interface PlanTierSectionProps {
  workspaces: WorkspaceOverrideRow[];
}

const PLAN_TIERS = ["free", "starter", "growth", "agency"] as const;

/**
 * Admin-only testing override: force any workspace's plan tier without a
 * real Razorpay payment, so every paid-tier feature (competitor tracking,
 * custom prompts, reports, on-demand checks) can be verified end to end
 * while Razorpay stays unconfigured/on hold. See
 * progress/modules/5.9-billing-and-subscription.md decisions log,
 * 2026-08-14 entry.
 */
export function PlanTierSection({ workspaces }: PlanTierSectionProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(workspaceId: string, tier: (typeof PLAN_TIERS)[number]) {
    setBusyId(workspaceId);
    setError(null);
    const result = await setWorkspacePlanTierAction(workspaceId, tier);
    if ("error" in result) {
      setError(`Failed to update ${workspaceId}: ${result.error}`);
      setBusyId(null);
    } else {
      window.location.reload();
    }
  }

  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Plan Tier Override (Testing)</h2>
      <p className="text-sm text-gray-500 mb-6">
        Force a workspace onto any plan tier without a real payment. Razorpay stays fully
        unconfigured/on hold — this writes directly to{" "}
        <code className="font-mono text-xs bg-gray-100 px-1 rounded">workspaces.plan_tier</code>,
        the same column a real subscription would set, so every paid-tier UI gate and DB limit
        behaves exactly as it would for a real paying customer.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Workspace
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Owner
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Plan Tier
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {workspaces.map((ws) => (
              <tr key={ws.id}>
                <td className="px-4 py-2 text-sm text-gray-900">{ws.name}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{ws.ownerEmail ?? "—"}</td>
                <td className="px-4 py-2 text-sm">
                  <select
                    value={ws.planTier}
                    disabled={busyId === ws.id}
                    onChange={(e) =>
                      handleChange(ws.id, e.target.value as (typeof PLAN_TIERS)[number])
                    }
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm disabled:opacity-50"
                  >
                    {PLAN_TIERS.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {workspaces.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                  No workspaces yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
