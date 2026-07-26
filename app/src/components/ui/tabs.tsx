"use client";

import * as React from "react";

export interface TabItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (value: string) => void;
  className?: string;
  variant?: "default" | "pills";
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  className = "",
  variant = "default",
}: TabsProps) {
  return (
    <div className={`flex gap-1 ${className}`} role="tablist" aria-label="Tabs">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={activeTab === tab.value}
          aria-controls={`panel-${tab.value}`}
          id={`tab-${tab.value}`}
          disabled={tab.disabled}
          onClick={() => !tab.disabled && onChange(tab.value)}
          className={`
            px-4 py-2 text-sm font-medium rounded-lg transition-colors
            ${tab.disabled ? "opacity-50 cursor-not-allowed" : "hover:text-text-primary"}
            ${
              variant === "pills"
                ? activeTab === tab.value
                  ? "bg-accent-muted text-accent"
                  : "text-text-secondary hover:bg-surface-2"
                : activeTab === tab.value
                  ? "bg-surface-1 border-b-2 border-accent text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary"
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
