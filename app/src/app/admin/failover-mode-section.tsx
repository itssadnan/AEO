"use client";

import type { ProviderName, FailoverMode } from "@/modules/admin";
import { setFailoverModeAction } from "@/modules/admin/actions";

interface FailoverModeSectionProps {
  failoverModes: Record<ProviderName, FailoverMode>;
}

export function FailoverModeSection({ failoverModes }: FailoverModeSectionProps) {
  const providers: ProviderName[] = ["gemini", "nvidia_nim"];

  async function handleToggleMode(provider: ProviderName, currentMode: FailoverMode) {
    const newMode: FailoverMode = currentMode === "shared" ? "emergency-only" : "shared";
    const result = await setFailoverModeAction(provider, newMode);
    if ("error" in result) {
      alert(`Failed to change failover mode: ${result.error}`);
    } else {
      window.location.reload();
    }
  }

  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Failover Mode</h2>
      <p className="text-sm text-gray-500 mb-6">
        Controls whether secondary/tertiary keys absorb rate limits (<strong>shared</strong>) or are
        reserved for hard failures only (<strong>emergency-only</strong>).
      </p>

      <div className="space-y-4">
        {providers.map((provider) => {
          const mode = failoverModes[provider];
          return (
            <div key={provider} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 capitalize">
                    {provider.replace("_", " ")}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Current:{" "}
                    <span className="font-mono font-medium capitalize">{mode}</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600 bg-yellow-50 px-3 py-1.5 rounded border border-yellow-200">
                    ⚠ Switch to <strong>emergency-only</strong> the moment primary is upgraded to
                    paid/higher-tier.
                  </div>
                  <button
                    onClick={() => handleToggleMode(provider, mode)}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                  >
                    Switch to {mode === "shared" ? "emergency-only" : "shared"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}