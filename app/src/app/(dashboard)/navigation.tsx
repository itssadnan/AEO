"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Brand {
  id: string;
  name: string;
}

interface NavigationProps {
  userEmail: string;
  workspaceName: string;
  planTier: "free" | "starter" | "growth" | "agency";
  brands: Brand[];
  selectedBrandId: string | null;
  userRole: "owner" | "member" | "viewer";
}

/**
 * Persistent sidebar navigation for dashboard views.
 * Shows workspace name, brand switcher, and the 5 view tabs.
 */
export function Navigation({
  userEmail,
  workspaceName,
  planTier,
  brands,
  selectedBrandId,
  userRole,
}: NavigationProps) {
  const pathname = usePathname();
  const [brandId, setBrandId] = useState<string | null>(selectedBrandId);
  // Not yet used for display — kept for a future "signed in as" footer; see
  // the no-op reference below rather than inventing that UI here.
  void userEmail;

  // Real routes are the route-group's own pages (/overview, /prompts, ...),
  // which read brandId from a `?brandId=` search param, not a path segment.
  // NOTE: these previously pointed at nonexistent `/dashboard/${brandId}/...`
  // paths (dead links, would 404 for every user) — found and fixed while
  // cleaning up this file's unused-var lint warnings.
  const views = [
    { basePath: "/overview", label: "Overview", icon: "📊" },
    { basePath: "/prompts", label: "Prompt Explorer", icon: "💬" },
    { basePath: "/competitors", label: "Competitor Explorer", icon: "🏢" },
    { basePath: "/reports", label: "Reports", icon: "📄" },
    { basePath: "/settings", label: "Settings", icon: "⚙️" },
  ];

  if (!brandId && brands.length === 0) {
    return (
      <aside className="w-64 lg:w-72 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
            {workspaceName}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">No brands yet</p>
        </div>
        <Link
          href="/brands/new"
          className="block w-full text-center py-2 px-3 rounded-lg bg-[var(--color-accent-muted)] text-[var(--color-accent)] text-sm font-medium hover:bg-[var(--color-accent)] hover:text-white transition-colors"
        >
          Create your first brand
        </Link>
      </aside>
    );
  }

  return (
    <aside className="w-64 lg:w-72 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-1)] flex flex-col">
      {/* Workspace header */}
      <div className="p-4 border-b border-[var(--color-border)]">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
          {workspaceName}
        </h2>
        <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)]">
          {planTier.charAt(0).toUpperCase() + planTier.slice(1)} Plan
        </span>
      </div>

      {/* Brand switcher */}
      <div className="p-4 border-b border-[var(--color-border)]">
        <label className="block text-xs font-medium text-[var(--color-text-tertiary)] mb-2">
          Brand
        </label>
        <select
          value={brandId ?? ""}
          onChange={(e) => setBrandId(e.target.value || null)}
          className="w-full px-3 py-2 bg-[var(--color-surface-0)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      {/* View navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {views.map((view) => {
          const href = brandId ? `${view.basePath}?brandId=${brandId}` : view.basePath;
          const isActive = pathname === view.basePath;
          return (
            <Link
              key={view.label}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]",
              )}
            >
              <span aria-hidden="true">{view.icon}</span>
              {view.label}
            </Link>
          );
        })}

        {/* Not one of the 5 tracking views -- separated below a divider so it
            doesn't read as "another view of my data". */}
        <div className="pt-3 mt-3 border-t border-[var(--color-border)]">
          <Link
            href="/help"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === "/help"
                ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]",
            )}
          >
            <span aria-hidden="true">❓</span>
            How it works
          </Link>
        </div>
      </nav>

      {/* Upgrade prompt -- only for workspaces actually still on the free
          plan; this used to show for every non-owner regardless of their
          real plan tier (found during independent verification, 2026-08-14).
          BUG FIX (2026-09-01): the copy itself was also stale on two counts
          -- "Pro" isn't a real plan tier here (Free/Starter/Growth/Agency
          are), and "competitor tracking" hasn't been paid-only since the
          same-day fix in competitor-explorer-view.tsx. Reworded to name
          what's actually still free-tier-limited. */}
      {userRole !== "owner" && brands.length > 0 && planTier === "free" && (
        <div className="p-4 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-tertiary)] text-center">
            Upgrade for more prompts, more brands, and automated recurring checks
          </p>
        </div>
      )}
    </aside>
  );
}
