"use client";

import * as React from "react";
import { createPortal } from "react-dom";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Drawer({ isOpen, onClose, title, children, className = "" }: DrawerProps) {
  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative flex flex-col w-full max-w-2xl bg-surface-1 border border-border rounded-xl shadow-xl overflow-hidden ${className}`}
        style={{ right: 0 }}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="drawer-title" className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );

  if (typeof window === "undefined") {
    return null;
  }

  return createPortal(content, document.body);
}
