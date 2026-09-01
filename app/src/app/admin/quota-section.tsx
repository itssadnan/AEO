"use client";

import type { ProviderQuotaSnapshot, ProviderName, KeySlot } from "@/modules/admin";
import { KNOWN_FREE_TIER_CAPS } from "@/modules/admin/quota-caps";
import { Badge } from "@/components/ui/badge";

interface QuotaSectionProps {
  quotaSnapshot: ProviderQuotaSnapshot[];
  knownFreeTierCaps: typeof KNOWN_FREE_TIER_CAPS;
  isNearCap: (count: number, cap: number | null) => boolean;
}

// Restyled onto the shared design system (Module 5.6) 2026-09-01 — all
// data/logic below unchanged, only markup/classes touched.
export function QuotaSection({ quotaSnapshot, knownFreeTierCaps, isNearCap }: QuotaSectionProps) {
  const keySlots: (KeySlot | "unknown")[] = ["primary", "secondary", "tertiary", "unknown"];

  return (
    <section className="rounded-xl border border-border bg-surface-1 p-6">
      <h2 className="mb-1 text-xl font-semibold text-text-primary">
        Quota Consumption (per key slot)
      </h2>
      <p className="mb-6 text-sm text-text-secondary">
        Request counts for the last 1h and 24h, broken down by provider and key slot. Historical
        rows before migration 0019 show as &quot;unknown&quot; slot — this is expected.
      </p>

      <div className="space-y-6">
        {quotaSnapshot.map((provider) => (
          <div
            key={provider.provider}
            className="border-t border-border pt-6 first:border-0 first:pt-0"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium text-text-primary capitalize">
                {provider.provider.replace("_", " ")}
              </h3>
              <span className="text-sm text-text-tertiary">{provider.informationalCapNote}</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-surface-2">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                      Key Slot
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                      Last 1h
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                      Last 24h
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-text-tertiary uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {keySlots.map((slot) => {
                    const counts = provider.byKeySlot[slot];
                    const capInfo =
                      knownFreeTierCaps[
                        provider.provider === "gemini"
                          ? "gemini-3.5-flash-lite"
                          : "nvidia_nim_default"
                      ];
                    const rpmCap = capInfo?.rpm ?? null;
                    const nearCap = isNearCap(counts.last1h, rpmCap);

                    return (
                      <tr
                        key={slot}
                        className={
                          nearCap
                            ? "bg-[var(--color-warning)]/10"
                            : "hover:bg-surface-2/50 transition-colors"
                        }
                      >
                        <td className="px-4 py-3 text-sm font-medium text-text-primary capitalize">
                          {slot}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-primary">{counts.last1h}</td>
                        <td className="px-4 py-3 text-sm text-text-primary">{counts.last24h}</td>
                        <td className="px-4 py-3 text-sm">
                          {nearCap ? (
                            <Badge tone="warning">Near cap (≥80%)</Badge>
                          ) : (
                            <span className="text-text-tertiary">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
