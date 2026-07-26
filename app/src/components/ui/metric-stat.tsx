"use client";

import * as React from "react";

export interface MetricStatProps {
  value: string | number;
  label: string;
  trend?: "up" | "down" | "neutral";
  trendDelta?: string;
  engineBadge?: "gemini" | "nvidia-nim";
  calculationDisclosure?: React.ReactNode;
  className?: string;
}

export function MetricStat({
  value,
  label,
  trend,
  trendDelta,
  engineBadge,
  calculationDisclosure,
  className = "",
}: MetricStatProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-5xl font-semibold font-mono tabular-nums text-text-primary">
          {value}
        </span>
        {engineBadge && <EngineBadge engine={engineBadge} />}
        {calculationDisclosure && <span className="ml-auto">{calculationDisclosure}</span>}
      </div>
      <p className="text-sm text-text-secondary">{label}</p>
      {trend && trendDelta && (
        <div className="flex items-center gap-1">
          <span
            className={`font-mono tabular-nums text-xs ${
              trend === "up"
                ? "text-positive"
                : trend === "down"
                  ? "text-negative"
                  : "text-text-tertiary"
            }`}
          >
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendDelta}
          </span>
          <span className="text-xs text-text-tertiary">vs previous period</span>
        </div>
      )}
    </div>
  );
}

interface EngineBadgeProps {
  engine: "gemini" | "nvidia-nim";
}

function EngineBadge({ engine }: EngineBadgeProps) {
  const config = {
    gemini: {
      bg: "bg-engine-gemini/10",
      text: "text-engine-gemini",
      label: "Gemini Visibility",
    },
    "nvidia-nim": {
      bg: "bg-engine-nvidia-nim/10",
      text: "text-engine-nvidia-nim",
      label: "NVIDIA NIM Explanation",
    },
  }[engine];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
      </span>
      {config.label}
    </span>
  );
}
