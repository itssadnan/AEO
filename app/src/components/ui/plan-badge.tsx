"use client";

export interface PlanBadgeProps {
  plan: "free" | "starter" | "growth" | "agency";
  size?: "sm" | "md";
  className?: string;
}

export function PlanBadge({ plan, size = "md", className = "" }: PlanBadgeProps) {
  const config = {
    free: {
      bg: "bg-surface-2",
      text: "text-text-secondary",
      label: "Free",
      border: "border-border",
    },
    starter: {
      bg: "bg-accent-muted",
      text: "text-accent",
      label: "Starter",
      border: "border-accent/30",
    },
    growth: {
      bg: "bg-positive-muted",
      text: "text-positive",
      label: "Growth",
      border: "border-positive/30",
    },
    agency: {
      bg: "bg-engine-gemini/10",
      text: "text-engine-gemini",
      label: "Agency",
      border: "border-engine-gemini/30",
    },
  }[plan];

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-xs",
    md: "px-2 py-0.5 text-xs",
  };

  return (
    <span
      className={`inline-flex items-center rounded-lg font-medium border ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]} ${className}`}
    >
      {config.label}
    </span>
  );
}
