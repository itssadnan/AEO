"use client";

import type { ChurnCustomer } from "@/modules/admin";

interface ChurnSignalSectionProps {
  churnSignal: ChurnCustomer[];
}

export function ChurnSignalSection({ churnSignal }: ChurnSignalSectionProps) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Churn Signal (Inactive 14+ Days)</h2>
      <p className="text-sm text-gray-500 mb-6">
        Workspaces whose owners have not signed in for 14+ days. Based on Supabase Auth&apos;s
        <code className="font-mono text-xs bg-gray-100 px-1 rounded">last_sign_in_at</code>.
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Workspace
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Plan Tier
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Sign-In
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Days Inactive
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {churnSignal.map((customer) => (
              <tr key={customer.workspaceId}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {customer.workspaceName}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 capitalize">{customer.planTier}</td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {customer.lastSignInAt
                    ? new Date(customer.lastSignInAt).toLocaleString()
                    : "Never"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {customer.daysSinceLastSignIn ?? "—"}
                </td>
              </tr>
            ))}
            {churnSignal.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
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
