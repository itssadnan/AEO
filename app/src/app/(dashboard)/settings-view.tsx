"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EngineBadge } from "@/components/ui/engine-badge";
import { PlanBadge } from "@/components/ui/plan-badge";
import { LockedPanel } from "@/components/ui/locked-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type {
  BrandWithRelations,
  OverviewMetrics,
  EmptyStateConfig,
  Competitor,
  Prompt,
} from "@/modules/dashboard/types";
// Deliberately bypassing the modules/billing barrel (index.ts) here, same
// exception already established and documented in Module 5.7's commit
// "fix(5.7): bypass crawl-audit barrel for client-safe imports": the barrel
// re-exports webhook-verify.ts/razorpay-client.ts alongside plain data and
// Server Actions, and a "use client" file importing that mix breaks the
// Vercel build (server-only code reachable from the client bundle graph).
// Importing directly from plans.ts (plain data, no server APIs) and
// actions.ts (a "use server" file -- Next.js compiles its exports into
// client-safe RPC stubs regardless of import path) avoids the problem.
import { PLAN_CATALOG, PAID_PLAN_TIER_IDS, type PaidPlanTierId } from "@/modules/billing/plans";
import {
  startCheckoutAction,
  changePlanAction,
  cancelSubscriptionAction,
} from "@/modules/billing/actions";
import type { SubscriptionRow, UsageSnapshot } from "@/modules/billing/queries";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const RAZORPAY_CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpayCheckoutScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Razorpay Checkout")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay Checkout"));
    document.body.appendChild(script);
  });
}

interface SettingsViewProps {
  brand: BrandWithRelations;
  overview: OverviewMetrics;
  emptyState: EmptyStateConfig;
  competitors: Competitor[];
  prompts: Prompt[];
  workspace: { id: string; name: string; plan_tier: "free" | "starter" | "growth" | "agency" };
  subscription: SubscriptionRow | null;
  usage: UsageSnapshot;
  isOwner: boolean;
  /** Computed server-side from isRazorpayConfigured() -- payments stay on
   * hold until real Razorpay credentials are set (see razorpay-client.ts). */
  isRazorpayConfigured: boolean;
}

/**
 * Settings view — brand settings, competitor management, prompt management, billing.
 */
export function SettingsView({
  brand,
  competitors,
  prompts,
  workspace,
  subscription,
  usage,
  isOwner,
  isRazorpayConfigured,
}: SettingsViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"brand" | "competitors" | "prompts" | "billing">(
    "brand",
  );
  const [engine, setEngine] = useState<"gemini" | "nvidia-nim">("gemini");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  async function handleUpgrade(tier: PaidPlanTierId) {
    setBillingBusy(true);
    setBillingError(null);
    setBillingMessage(null);
    try {
      const result = await startCheckoutAction(workspace.id, tier);
      if ("error" in result) {
        setBillingError(result.error);
        return;
      }
      await loadRazorpayCheckoutScript();
      if (!window.Razorpay) {
        setBillingError("Razorpay Checkout failed to load.");
        return;
      }
      const rzp = new window.Razorpay({
        key: result.razorpayKeyId,
        subscription_id: result.razorpaySubscriptionId,
        name: "AEO Visibility",
        description: `${PLAN_CATALOG[tier].name} plan`,
        handler: () => {
          setBillingMessage("Payment submitted — your plan will update once Razorpay confirms it.");
          router.refresh();
        },
        theme: { color: "#6366f1" },
      });
      rzp.open();
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Unknown error starting checkout.");
    } finally {
      setBillingBusy(false);
    }
  }

  async function handleChangePlan(tier: PaidPlanTierId) {
    setBillingBusy(true);
    setBillingError(null);
    setBillingMessage(null);
    try {
      const result = await changePlanAction(workspace.id, tier);
      if ("error" in result) {
        setBillingError(result.error);
        return;
      }
      setBillingMessage("Plan change submitted — this may take a moment to reflect.");
      router.refresh();
    } finally {
      setBillingBusy(false);
    }
  }

  async function handleCancel() {
    if (!subscription?.razorpay_subscription_id) return;
    if (
      !confirm(
        "Cancel your subscription? You'll keep access until the end of the current billing period.",
      )
    ) {
      return;
    }
    setBillingBusy(true);
    setBillingError(null);
    setBillingMessage(null);
    try {
      const result = await cancelSubscriptionAction(
        workspace.id,
        subscription.razorpay_subscription_id,
      );
      if ("error" in result) {
        setBillingError(result.error);
        return;
      }
      setBillingMessage(
        "Cancellation requested — you'll keep access until the end of the current period.",
      );
      router.refresh();
    } finally {
      setBillingBusy(false);
    }
  }

  // Free tier lock check for competitor/prompt management
  const isLocked = workspace.plan_tier === "free";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Brand header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">{brand.name}</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">
            Workspace: {workspace.name} •{" "}
            <PlanBadge plan={workspace.plan_tier as "free" | "starter" | "growth" | "agency"} />
          </p>
        </div>
        <EngineBadge engine={engine} size="sm" />
      </div>

      {/* Tab navigation */}
      <nav
        className="flex gap-1 bg-[var(--color-surface-1)] rounded-lg p-1"
        role="tablist"
        aria-label="Settings tabs"
      >
        <button
          role="tab"
          aria-selected={activeTab === "brand"}
          onClick={() => setActiveTab("brand")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "brand"
              ? "bg-[var(--color-surface-0)] text-[var(--color-text-primary)] shadow-sm"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          Brand
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "competitors"}
          onClick={() => setActiveTab("competitors")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "competitors"
              ? "bg-[var(--color-surface-0)] text-[var(--color-text-primary)] shadow-sm"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          Competitors{" "}
          {competitors.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-[var(--color-accent)] text-white rounded-full">
              {competitors.length}
            </span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "prompts"}
          onClick={() => setActiveTab("prompts")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "prompts"
              ? "bg-[var(--color-surface-0)] text-[var(--color-text-primary)] shadow-sm"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          Prompts{" "}
          {prompts.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-[var(--color-accent)] text-white rounded-full">
              {prompts.length}
            </span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "billing"}
          onClick={() => setActiveTab("billing")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "billing"
              ? "bg-[var(--color-surface-0)] text-[var(--color-text-primary)] shadow-sm"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          Billing
        </button>
      </nav>

      {/* Tab panels */}
      {activeTab === "brand" && (
        <Card className="p-6 space-y-6">
          <h2 className="text-lg font-medium text-[var(--color-text-primary)]">Brand Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Brand Name
              </label>
              <input
                type="text"
                defaultValue={brand.name}
                className="w-full px-3 py-2 bg-[var(--color-surface-0)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                readOnly
              />
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                Brand name changes require support assistance.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Workspace
              </label>
              <p className="text-[var(--color-text-primary)]">{workspace.name}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                Plan:{" "}
                <PlanBadge plan={workspace.plan_tier as "free" | "starter" | "growth" | "agency"} />
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Default Engine
              </label>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as "gemini" | "nvidia-nim")}
                className="px-3 py-2 bg-[var(--color-surface-0)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                <option value="gemini">Google Gemini (Grounded Search)</option>
                <option value="nvidia-nim">NVIDIA NIM (Nemotron 3 Ultra)</option>
              </select>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                Default engine for new visibility checks.
              </p>
            </div>
            <div className="pt-4 border-t border-[var(--color-border)]">
              <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-2">
                Danger Zone
              </h3>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  confirm("Delete brand?") && alert("Delete functionality not implemented yet")
                }
              >
                Delete Brand
              </Button>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                This action cannot be undone. All data will be permanently deleted.
              </p>
            </div>
          </div>
        </Card>
      )}

      {activeTab === "competitors" && (
        <>
          {isLocked ? (
            <LockedPanel
              isLocked={true}
              lockMessage="Competitor management is a Pro feature. Upgrade to add and track competitors."
              ctaLabel="Upgrade to Pro"
              ctaHref="/settings/billing"
            >
              <div />
            </LockedPanel>
          ) : (
            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-[var(--color-text-primary)]">
                  Competitors
                </h2>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => alert("Add competitor modal not implemented yet")}
                >
                  Add Competitor
                </Button>
              </div>

              {competitors.length === 0 ? (
                <EmptyState
                  title="No competitors added"
                  description="Add competitors to track how they compare in AI visibility. Start with 3-5 direct competitors for best insights."
                  cta={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => alert("Add competitor modal not implemented yet")}
                    >
                      Add Your First Competitor
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {competitors.map((competitor) => (
                    <div
                      key={competitor.id}
                      className="flex items-center justify-between p-4 bg-[var(--color-surface-1)] rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-[var(--color-accent)]">
                            {competitor.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-[var(--color-text-primary)]">
                            {competitor.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <EngineBadge engine={engine} size="sm" />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => alert(`Edit ${competitor.name} not implemented yet`)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => alert(`Delete ${competitor.name} not implemented yet`)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {activeTab === "prompts" && (
        <>
          {isLocked ? (
            <LockedPanel
              isLocked={true}
              lockMessage="Custom prompt tracking is a Pro feature. Upgrade to add and manage your own prompts."
              ctaLabel="Upgrade to Pro"
              ctaHref="/settings/billing"
            >
              <div />
            </LockedPanel>
          ) : (
            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-[var(--color-text-primary)]">
                  Tracked Prompts
                </h2>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => alert("Add prompt modal not implemented yet")}
                >
                  Add Prompt
                </Button>
              </div>

              {prompts.length === 0 ? (
                <EmptyState
                  title="No prompts added"
                  description="Add prompts you want to track for AI visibility. We'll check how your brand appears in answers to these prompts."
                  cta={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => alert("Add prompt modal not implemented yet")}
                    >
                      Add Your First Prompt
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {prompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      className="flex items-center justify-between p-4 bg-[var(--color-surface-1)] rounded-lg"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-positive)]/10 flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-4 h-4 text-[var(--color-positive)]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--color-text-primary)] truncate">
                            {prompt.text}
                          </p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">
                            {prompt.is_active ? "Active" : "Inactive"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => alert(`Edit prompt not implemented yet`)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => alert(`Delete prompt not implemented yet`)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {activeTab === "billing" && (
        <Card className="p-6 space-y-6">
          <h2 className="text-lg font-medium text-[var(--color-text-primary)]">
            Billing & Subscription
          </h2>

          {billingError && (
            <div className="p-3 bg-[var(--color-negative)]/10 border border-[var(--color-negative)]/30 rounded-lg text-sm text-[var(--color-negative)]">
              {billingError}
            </div>
          )}
          {billingMessage && (
            <div className="p-3 bg-[var(--color-positive)]/10 border border-[var(--color-positive)]/30 rounded-lg text-sm text-[var(--color-positive)]">
              {billingMessage}
            </div>
          )}
          {!isOwner && (
            <div className="p-3 bg-[var(--color-surface-1)] rounded-lg text-sm text-[var(--color-text-secondary)]">
              Only the workspace owner can change plans or cancel the subscription.
            </div>
          )}

          <div className="p-4 bg-[var(--color-surface-1)] rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-medium text-[var(--color-text-primary)]">Current Plan</p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {workspace.name} workspace
                  {subscription?.status && workspace.plan_tier !== "free"
                    ? ` • subscription ${subscription.status}${subscription.cancel_at_cycle_end ? " (cancelling at period end)" : ""}`
                    : ""}
                </p>
              </div>
              <PlanBadge plan={workspace.plan_tier as "free" | "starter" | "growth" | "agency"} />
            </div>

            <div className="p-4 border border-[var(--color-border)] rounded-lg mb-4">
              <h3 className="font-medium text-[var(--color-text-primary)] mb-2">
                {PLAN_CATALOG[workspace.plan_tier].name} Plan —{" "}
                {PLAN_CATALOG[workspace.plan_tier].priceUsdDisplay}
              </h3>
              <ul className="space-y-1 text-sm text-[var(--color-text-secondary)]">
                <li>
                  ✓ Up to {PLAN_CATALOG[workspace.plan_tier].brandLimit} brand
                  {PLAN_CATALOG[workspace.plan_tier].brandLimit === 1 ? "" : "s"}
                </li>
                <li>✓ Up to {PLAN_CATALOG[workspace.plan_tier].promptLimit} prompts</li>
                <li>
                  ✓{" "}
                  {PLAN_CATALOG[workspace.plan_tier].checkFrequency === "on-demand"
                    ? "3 lifetime on-demand checks"
                    : `${PLAN_CATALOG[workspace.plan_tier].checkFrequency} automated checks`}
                </li>
              </ul>
            </div>

            {isOwner && !isRazorpayConfigured && (
              <div className="p-3 bg-[var(--color-surface-0)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-secondary)]">
                Payments aren&apos;t enabled yet — self-serve upgrades are on hold while this is
                still in testing. If you need a higher plan tier for testing, use the Plan Tier
                Override in the Admin Console.
              </div>
            )}
            {isOwner && isRazorpayConfigured && (
              <div className="space-y-2">
                {PAID_PLAN_TIER_IDS.filter((tier) => tier !== workspace.plan_tier).map((tier) => (
                  <Button
                    key={tier}
                    variant={workspace.plan_tier === "free" ? "primary" : "outline"}
                    size="lg"
                    className="w-full"
                    disabled={billingBusy}
                    onClick={() =>
                      workspace.plan_tier === "free" || !subscription?.razorpay_subscription_id
                        ? handleUpgrade(tier)
                        : handleChangePlan(tier)
                    }
                  >
                    {workspace.plan_tier === "free" ? "Upgrade" : "Switch"} to{" "}
                    {PLAN_CATALOG[tier].name} ({PLAN_CATALOG[tier].priceUsdDisplay})
                  </Button>
                ))}
                {workspace.plan_tier !== "free" && subscription?.razorpay_subscription_id && (
                  <Button
                    variant="destructive"
                    size="lg"
                    className="w-full"
                    disabled={billingBusy || subscription.cancel_at_cycle_end}
                    onClick={handleCancel}
                  >
                    {subscription.cancel_at_cycle_end
                      ? "Cancellation scheduled"
                      : "Cancel Subscription"}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="p-4 bg-[var(--color-surface-1)] rounded-lg">
            <h3 className="font-medium text-[var(--color-text-primary)] mb-3">Usage This Period</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-3 bg-[var(--color-surface-0)] rounded-lg">
                <p className="text-sm text-[var(--color-text-tertiary)]">Brands</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {usage.brandCount} / {usage.brandLimit}
                </p>
              </div>
              <div className="p-3 bg-[var(--color-surface-0)] rounded-lg">
                <p className="text-sm text-[var(--color-text-tertiary)]">Prompts (this brand)</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {usage.promptCount} / {usage.promptLimit}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
