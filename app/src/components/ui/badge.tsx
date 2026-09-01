import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "positive" | "negative" | "warning" | "accent" | "neutral";

const toneStyles: Record<BadgeTone, string> = {
  positive: "bg-positive-muted text-positive",
  negative: "bg-negative-muted text-negative",
  warning: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  accent: "bg-accent-muted text-accent",
  neutral: "bg-surface-2 text-text-secondary",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
