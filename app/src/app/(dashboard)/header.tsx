"use client";

import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PlanBadge } from "@/components/ui/plan-badge";

interface HeaderProps {
  userEmail: string;
  workspaceName: string;
  planTier: "free" | "starter" | "growth" | "agency";
}

/**
 * Top header bar for dashboard views.
 * Shows workspace name, plan tier, theme toggle, and user avatar.
 */
export function Header({ userEmail, workspaceName, planTier }: HeaderProps) {
  // Read theme from localStorage during render to avoid layout shift
  const getInitialTheme = () => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("theme") as "system" | "dark" | "light") || "system";
  };

  const [theme, setTheme] = useState<"system" | "dark" | "light">(getInitialTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  const initials = userEmail
    .split("@")[0]
    .split(".")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Plan badge rendering used to be a second, ad-hoc `planColors` map here
  // with only free/pro/enterprise keys — the exact same stale-alias bug
  // already found and fixed once in modules/dashboard/plan-tier.ts (a real
  // Starter/Growth/Agency workspace fell through to `undefined` styling).
  // Reuse the one correct, tested implementation instead of maintaining a
  // second copy. Found during independent verification, 2026-08-14.

  if (!mounted) {
    return (
      <header className="h-16 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] flex items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)] truncate max-w-xs">
            {workspaceName}
          </h1>
          <PlanBadge plan={planTier} />
        </div>
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-[var(--color-accent-muted)] flex items-center justify-center text-sm font-medium text-[var(--color-accent)]">
            {initials}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="h-16 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] truncate max-w-xs">
          {workspaceName}
        </h1>
        <PlanBadge plan={planTier} />
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle value={theme} onChange={setTheme} />

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--color-accent-muted)] flex items-center justify-center text-sm font-medium text-[var(--color-accent)]">
            {initials}
          </div>
          <span className="text-sm text-[var(--color-text-secondary)] hidden sm:block truncate max-w-[160px]">
            {userEmail}
          </span>
        </div>
      </div>
    </header>
  );
}
