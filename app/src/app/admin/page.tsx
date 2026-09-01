import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/security";
import {
  getKeyHealth,
  getFailoverModes,
  getQuotaSnapshot,
  getErrorLog,
  getChurnSignal,
  getAiTaskConfigs,
  getWorkspacesForOverride,
  type KeyHealthRow,
  type ProviderQuotaSnapshot,
  type ErrorLogEntry,
  type ChurnCustomer,
  type AiTaskConfigRow,
  type ProviderName,
  type KeySlot,
  type FailoverMode,
} from "@/modules/admin";
import { isNearCap, KNOWN_FREE_TIER_CAPS } from "@/modules/admin/quota-caps";
import { QuotaSection } from "./quota-section";
import { KeyHealthSection } from "./key-health-section";
import { FailoverModeSection } from "./failover-mode-section";
import { ErrorLogSection } from "./error-log-section";
import { ChurnSignalSection } from "./churn-signal-section";
import { AiTaskConfigsSection } from "./ai-task-configs-section";
import { PlanTierSection } from "./plan-tier-section";

export const dynamic = "force-dynamic";

// Restyled onto the shared design system (Module 5.6) 2026-09-01 — was
// hardcoded gray-50/gray-900 classes predating that system. Data fetching
// and section wiring below unchanged.
export default async function AdminPage() {
  const authResult = await requireAdmin();
  if (authResult) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-text-primary">Not authorized</h1>
          <p className="mt-2 text-text-secondary">You do not have access to this page.</p>
        </div>
      </div>
    );
  }

  const [
    keyHealth,
    failoverModes,
    quotaSnapshot,
    errorLog,
    churnSignal,
    aiTaskConfigs,
    workspacesForOverride,
  ] = await Promise.all([
    getKeyHealth(),
    getFailoverModes(),
    getQuotaSnapshot(),
    getErrorLog(50),
    getChurnSignal(14),
    getAiTaskConfigs(),
    getWorkspacesForOverride(),
  ]);

  return (
    <div className="min-h-screen bg-surface-0 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">Admin / Ops Console</h1>
          <p className="mt-2 text-text-secondary">
            Internal view of API quota usage, key health, failover modes, and AI task configuration.
          </p>
        </div>

        <div className="space-y-8">
          <PlanTierSection workspaces={workspacesForOverride} />

          <QuotaSection
            quotaSnapshot={quotaSnapshot}
            knownFreeTierCaps={KNOWN_FREE_TIER_CAPS}
            isNearCap={isNearCap}
          />

          <KeyHealthSection keyHealth={keyHealth} />

          <FailoverModeSection failoverModes={failoverModes} />

          <ErrorLogSection errorLog={errorLog} />

          <ChurnSignalSection churnSignal={churnSignal} />

          <AiTaskConfigsSection aiTaskConfigs={aiTaskConfigs} />
        </div>
      </div>
    </div>
  );
}
