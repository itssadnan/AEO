"use client";

import type { ProviderQuotaSnapshot, ProviderName, KeySlot } from "@/modules/admin";
import { KNOWN_FREE_TIER_CAPS } from "@/modules/admin/quota-caps";

interface QuotaSectionProps {
  quotaSnapshot: ProviderQuotaSnapshot[];
  knownFreeTierCaps: typeof KNOWN_FREE_TIER_CAPS;
  isNearCap: (count: number, cap: number | null) => boolean;
}

export function QuotaSection({ quotaSnapshot, knownFreeTierCaps, isNearCap }: QuotaSectionProps) {
  const keySlots: (KeySlot | "unknown")[] = ["primary", "secondary", "tertiary", "unknown"];

  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Quota Consumption (per key slot)</h2>
      <p className="text-sm text-gray-500 mb-6">
        Request counts for the last 1h and 24h, broken down by provider and key slot. Historical
        rows before migration 0019 show as "unknown" slot — this is expected.
      </p>

      <div className="space-y-6">
        {quotaSnapshot.map((provider) => (
          <div key={provider.provider} className="border-t border-gray-100 pt-6 first:border-0 first:pt-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 capitalize">
                {provider.provider.replace("_", " ")}
              </h3>
              <span className="text-sm text-gray-500">{provider.informationalCapNote}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Key Slot
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last 1h
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last 24h
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {keySlots.map((slot) => {
                    const counts = provider.byKeySlot[slot];
                    const capInfo = knownFreeTierCaps[
                      provider.provider === "gemini"
                        ? "gemini-3.5-flash-lite"
                        : "nvidia_nim_default"
                    ];
                    const rpmCap = capInfo?.rpm ?? null;
                    const nearCap = isNearCap(counts.last1h, rpmCap);

                    return (
                      <tr key={slot} className={nearCap ? "bg-yellow-50" : ""}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">
                          {slot}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{counts.last1h}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{counts.last24h}</td>
                        <td className="px-4 py-3 text-sm">
                          {nearCap ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Near cap (≥80%)
                            </span>
                          ) : (
                            <span className="text-gray-500">OK</span>
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