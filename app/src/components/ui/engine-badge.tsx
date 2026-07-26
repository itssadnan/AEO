"use client";

import * as React from "react";

export interface EngineBadgeProps {
  engine: "gemini" | "nvidia-nim";
  size?: "sm" | "md";
  className?: string;
}

export function EngineBadge({ engine, size = "md", className = "" }: EngineBadgeProps) {
  const config = {
    gemini: {
      bg: "bg-engine-gemini/10",
      text: "text-engine-gemini",
      label: "Gemini Visibility",
      dot: "bg-engine-gemini",
    },
    "nvidia-nim": {
      bg: "bg-engine-nvidia-nim/10",
      text: "text-engine-nvidia-nim",
      label: "NVIDIA NIM Explanation",
      dot: "bg-engine-nvidia-nim",
    },
  }[engine];

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-xs",
    md: "px-2 py-0.5 text-xs",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg font-medium ${config.bg} ${config.text} ${sizeClasses[size]} ${className}`}
    >
      <span className={`relative flex h-1.5 w-1.5 rounded-full ${config.dot}`}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
      </span>
      {config.label}
    </span>
  );
}
