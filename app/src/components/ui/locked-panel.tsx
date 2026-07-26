"use client";

import * as React from "react";
import { LockIcon } from "lucide-react";

export interface LockedPanelProps {
  children: React.ReactNode;
  isLocked: boolean;
  lockMessage?: string;
  ctaLabel?: string;
  ctaHref?: string;
  ctaOnClick?: () => void;
  className?: string;
}

export function LockedPanel({
  children,
  isLocked,
  lockMessage = "Upgrade to unlock this feature",
  ctaLabel = "Upgrade",
  ctaHref,
  ctaOnClick,
  className = "",
}: LockedPanelProps) {
  if (!isLocked) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 bg-surface-1/50 backdrop-blur-sm rounded-xl z-10 flex items-center justify-center p-6 pointer-events-none">
        <div className="flex flex-col items-center gap-3 text-center max-w-xs">
          <LockIcon className="h-10 w-10 text-text-tertiary" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-sm text-text-secondary">{lockMessage}</p>
          {ctaHref ? (
            <a
              href={ctaHref}
              className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              {ctaLabel}
            </a>
          ) : ctaOnClick ? (
            <button
              type="button"
              onClick={ctaOnClick}
              className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              {ctaLabel}
            </button>
          ) : null}
        </div>
      </div>
      <div className="opacity-40 pointer-events-none">{children}</div>
    </div>
  );
}
