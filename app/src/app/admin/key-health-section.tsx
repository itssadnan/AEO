"use client";

import type { KeyHealthRow, ProviderName, KeySlot } from "@/modules/admin";
import { clearDeadKeyAction } from "@/modules/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface KeyHealthSectionProps {
  keyHealth: KeyHealthRow[];
}

// Restyled onto the shared design system (Module 5.6) 2026-09-01 — all
// data/logic below unchanged, only markup/classes touched.
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
    <section className="rounded-xl border border-border bg-surface-1 p-6">
      <h2 className="mb-1 text-xl font-semibold text-text-primary">Key Pool Health</h2>
      <p className="mb-6 text-sm text-text-secondary">
        Current status of each API key in the pool. Dead keys (401/403) are excluded from the
        failover rotation until manually cleared.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Provider
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Slot
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Dead Since
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Last Error
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {keyHealth.map((row) => (
              <tr
                key={`${row.provider}-${row.keySlot}`}
                className={
                  row.isDead ? "bg-negative-muted" : "hover:bg-surface-2/50 transition-colors"
                }
              >
                <td className="px-4 py-3 text-sm font-medium text-text-primary capitalize">
                  {row.provider.replace("_", " ")}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary capitalize">{row.keySlot}</td>
                <td className="px-4 py-3 text-sm">
                  {row.isDead ? (
                    <Badge tone="negative">Dead</Badge>
                  ) : (
                    <Badge tone="positive">Alive</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary">
                  {row.deadAt ? new Date(row.deadAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary">{row.lastErrorCode ?? "—"}</td>
                <td className="px-4 py-3 text-sm">
                  {row.isDead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-accent hover:text-accent-hover px-0"
                      onClick={() => handleClearDeadKey(row.provider, row.keySlot)}
                    >
                      Clear dead flag
                    </Button>
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
