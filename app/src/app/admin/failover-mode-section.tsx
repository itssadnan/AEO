"use client";

import type { ProviderName, FailoverMode } from "@/modules/admin";
import { setFailoverModeAction } from "@/modules/admin/actions";
import { Button } from "@/components/ui/button";

interface FailoverModeSectionProps {
  failoverModes: Record<ProviderName, FailoverMode>;
}

// Restyled onto the shared design system (Module 5.6) 2026-09-01 — all
// data/logic below unchanged, only markup/classes touched.
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
    <section className="rounded-xl border border-border bg-surface-1 p-6">
      <h2 className="mb-1 text-xl font-semibold text-text-primary">Failover Mode</h2>
      <p className="mb-6 text-sm text-text-secondary">
        Controls whether secondary/tertiary keys absorb rate limits (<strong>shared</strong>) or are
        reserved for hard failures only (<strong>emergency-only</strong>).
      </p>

      <div className="space-y-4">
        {providers.map((provider) => {
          const mode = failoverModes[provider];
          return (
            <div key={provider} className="rounded-lg border border-border bg-surface-2 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-medium text-text-primary capitalize">
                    {provider.replace("_", " ")}
                  </h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    Current: <span className="font-mono font-medium capitalize">{mode}</span>
                  </p>
                </div>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-1.5 text-sm text-text-primary">
                    ⚠ Switch to <strong>emergency-only</strong> the moment primary is upgraded to
                    paid/higher-tier.
                  </div>
                  <Button size="sm" onClick={() => handleToggleMode(provider, mode)}>
                    Switch to {mode === "shared" ? "emergency-only" : "shared"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
