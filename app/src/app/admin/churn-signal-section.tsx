"use client";

import type { ChurnCustomer } from "@/modules/admin";

interface ChurnSignalSectionProps {
  churnSignal: ChurnCustomer[];
}

// Restyled onto the shared design system (Module 5.6) 2026-09-01 — all
// data below unchanged, only markup/classes touched.
export function ChurnSignalSection({ churnSignal }: ChurnSignalSectionProps) {
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-6">
      <h2 className="mb-1 text-xl font-semibold text-text-primary">
        Churn Signal (Inactive 14+ Days)
      </h2>
      <p className="mb-6 text-sm text-text-secondary">
        Workspaces whose owners have not signed in for 14+ days. Based on Supabase Auth&apos;s{" "}
        <code className="rounded bg-surface-2 px-1 font-mono text-xs text-text-primary">
          last_sign_in_at
        </code>
        .
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Workspace
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Plan Tier
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Last Sign-In
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Days Inactive
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {churnSignal.map((customer) => (
              <tr key={customer.workspaceId} className="hover:bg-surface-2/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-text-primary">
                  {customer.workspaceName}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary capitalize">
                  {customer.planTier}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary">
                  {customer.lastSignInAt
                    ? new Date(customer.lastSignInAt).toLocaleString()
                    : "Never"}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary">
                  {customer.daysSinceLastSignIn ?? "—"}
                </td>
              </tr>
            ))}
            {churnSignal.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-tertiary">
                  No inactive workspaces found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
