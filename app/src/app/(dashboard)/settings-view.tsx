"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { EngineBadge } from "@/components/ui/engine-badge";
import { PlanBadge } from "@/components/ui/plan-badge";
import { LockedPanel } from "@/components/ui/locked-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import type {
  BrandWithRelations,
  OverviewMetrics,
  EmptyStateConfig,
  Competitor,
  Prompt,
} from "@/modules/dashboard/types";

interface SettingsViewProps {
  brand: BrandWithRelations;
  overview: OverviewMetrics;
  emptyState: EmptyStateConfig;
  competitors: Competitor[];
  prompts: Prompt[];
  workspace: { id: string; name: string; plan_tier: "free" | "starter" | "growth" | "agency" };
}

/**
 * Settings view — brand settings, competitor management, prompt management, billing.
 */
export function SettingsView({
  brand,
  overview,
  emptyState,
  competitors,
  prompts,
  workspace,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<"brand" | "competitors" | "prompts" | "billing">(
    "brand",
  );
  const [engine, setEngine] = useState<"gemini" | "nvidia-nim">("gemini");

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

          <div className="p-4 bg-[var(--color-surface-1)] rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-medium text-[var(--color-text-primary)]">Current Plan</p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {workspace.name} workspace
                </p>
              </div>
              <PlanBadge plan={workspace.plan_tier as "free" | "starter" | "growth" | "agency"} />
            </div>

            {workspace.plan_tier === "free" ? (
              <div className="space-y-4">
                <div className="p-4 border border-[var(--color-border)] rounded-lg">
                  <h3 className="font-medium text-[var(--color-text-primary)] mb-2">Free Plan</h3>
                  <ul className="space-y-1 text-sm text-[var(--color-text-secondary)]">
                    <li>✓ 1 brand</li>
                    <li>✓ 5 prompts</li>
                    <li>✓ 0 competitors (view only)</li>
                    <li>✓ Overview dashboard</li>
                    <li>✗ Competitor Explorer</li>
                    <li>✗ Prompt Explorer</li>
                    <li>✗ Reports (PDF/CSV)</li>
                    <li>✗ Scheduled reports</li>
                  </ul>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => (window.location.href = "/settings/billing")}
                >
                  Upgrade to Pro
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  You are on the <strong>{workspace.plan_tier}</strong> plan. Manage your
                  subscription below.
                </p>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => (window.location.href = "/settings/billing")}
                >
                  Manage Subscription
                </Button>
              </div>
            )}
          </div>

          <div className="p-4 bg-[var(--color-surface-1)] rounded-lg">
            <h3 className="font-medium text-[var(--color-text-primary)] mb-3">Usage This Period</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-3 bg-[var(--color-surface-0)] rounded-lg">
                <p className="text-sm text-[var(--color-text-tertiary)]">Brands</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  1 / {workspace.plan_tier === "free" ? 1 : "∞"}
                </p>
              </div>
              <div className="p-3 bg-[var(--color-surface-0)] rounded-lg">
                <p className="text-sm text-[var(--color-text-tertiary)]">Prompts</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {prompts.length} / {workspace.plan_tier === "free" ? 5 : "∞"}
                </p>
              </div>
              <div className="p-3 bg-[var(--color-surface-0)] rounded-lg">
                <p className="text-sm text-[var(--color-text-tertiary)]">Competitors</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                  {competitors.length} / {workspace.plan_tier === "free" ? 0 : "∞"}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
