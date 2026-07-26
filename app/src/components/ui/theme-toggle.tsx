"use client";

import * as React from "react";
import { Sun, Moon, Monitor } from "lucide-react";

export type Theme = "system" | "dark" | "light";

export interface ThemeToggleProps {
  value: Theme;
  onChange: (theme: Theme) => void;
  className?: string;
}

const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "System", icon: <Monitor className="h-4 w-4" /> },
  { value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
  { value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
];

export function ThemeToggle({ value, onChange, className = "" }: ThemeToggleProps) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-lg bg-surface-1 border border-border p-1 ${className}`}
      role="group"
      aria-label="Theme selector"
    >
      {themes.map((theme) => (
        <button
          key={theme.value}
          type="button"
          role="radio"
          aria-checked={value === theme.value}
          onClick={() => onChange(theme.value)}
          className={`
            flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors
            ${
              value === theme.value
                ? "bg-accent-muted text-accent"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
            }
          `}
        >
          {theme.icon}
          <span>{theme.label}</span>
        </button>
      ))}
    </div>
  );
}
