"use client";

import { useState } from "react";
import type { WorkspaceOverrideRow } from "@/modules/admin";
import { setWorkspacePlanTierAction } from "@/modules/admin/actions";
import { Select } from "@/components/ui/input";

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
 *
 * Restyled onto the shared design system (Module 5.6) 2026-09-01 — all
 * state/handlers below unchanged, only markup/classes touched.
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
    <section className="rounded-xl border border-border bg-surface-1 p-6">
      <h2 className="mb-1 text-xl font-semibold text-text-primary">Plan Tier Override (Testing)</h2>
      <p className="mb-6 text-sm text-text-secondary">
        Force a workspace onto any plan tier without a real payment. Razorpay stays fully
        unconfigured/on hold — this writes directly to{" "}
        <code className="rounded bg-surface-2 px-1 font-mono text-xs text-text-primary">
          workspaces.plan_tier
        </code>
        , the same column a real subscription would set, so every paid-tier UI gate and DB limit
        behaves exactly as it would for a real paying customer.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-negative/30 bg-negative-muted p-3 text-sm text-negative">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Workspace
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Owner
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Plan Tier
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {workspaces.map((ws) => (
              <tr key={ws.id} className="hover:bg-surface-2/50 transition-colors">
                <td className="px-4 py-2 text-sm text-text-primary">{ws.name}</td>
                <td className="px-4 py-2 text-sm text-text-secondary">{ws.ownerEmail ?? "—"}</td>
                <td className="px-4 py-2 text-sm">
                  <Select
                    value={ws.planTier}
                    disabled={busyId === ws.id}
                    onChange={(e) =>
                      handleChange(ws.id, e.target.value as (typeof PLAN_TIERS)[number])
                    }
                    className="w-40 py-1.5"
                  >
                    {PLAN_TIERS.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            ))}
            {workspaces.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-text-tertiary">
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
