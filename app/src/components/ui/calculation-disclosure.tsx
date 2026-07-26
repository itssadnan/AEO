"use client";

import * as React from "react";
import { Drawer } from "./drawer";
import { EngineBadge } from "./engine-badge";

export interface CalculationSource {
  promptText: string;
  provider: "gemini" | "nvidia-nim";
  model: string;
  checkedAt: string;
  rawAnswer: string;
  extractedEntities: {
    brandMentioned: boolean;
    positionAmongCompetitors: number | null;
    competitorNamesFound: string[];
    citedDomains: string[];
    citedDomainTypes: { type: string }[];
  };
}

export interface CalculationDisclosureProps {
  source: CalculationSource | null;
  triggerLabel?: string;
}

export function CalculationDisclosure({
  source,
  triggerLabel = "How we calculated this",
}: CalculationDisclosureProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  if (!source) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center rounded-lg p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
        aria-label={triggerLabel}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4M12 8h.01" />
        </svg>
      </button>

      <Drawer isOpen={isOpen} onClose={() => setIsOpen(false)} title={triggerLabel}>
        <div className="flex flex-col gap-6">
          <section>
            <h4 className="text-sm font-semibold text-text-secondary mb-2">Prompt & Model</h4>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex gap-2">
                <span className="text-text-tertiary min-w-[100px]">Prompt:</span>
                <span className="font-mono tabular-nums text-text-primary">
                  {source.promptText}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-text-tertiary min-w-[100px]">Provider:</span>
                <EngineBadge engine={source.provider} size="sm" />
              </div>
              <div className="flex gap-2">
                <span className="text-text-tertiary min-w-[100px]">Model:</span>
                <span className="font-mono tabular-nums text-text-primary">{source.model}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-text-tertiary min-w-[100px]">Checked at:</span>
                <span className="font-mono tabular-nums text-text-secondary">
                  {new Date(source.checkedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-text-secondary mb-2">Raw AI Answer</h4>
            <pre className="bg-surface-0 rounded-lg p-4 text-sm text-text-primary overflow-x-auto whitespace-pre-wrap font-sans">
              {source.rawAnswer || "(no answer returned)"}
            </pre>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-text-secondary mb-2">Extracted Entities</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-text-tertiary mb-1">Brand Mentioned</p>
                <p
                  className={`font-mono tabular-nums text-lg font-semibold ${source.extractedEntities.brandMentioned ? "text-positive" : "text-negative"}`}
                >
                  {source.extractedEntities.brandMentioned ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary mb-1">Position Among Competitors</p>
                <p className="font-mono tabular-nums text-lg font-semibold text-text-primary">
                  {source.extractedEntities.positionAmongCompetitors !== null
                    ? `#${source.extractedEntities.positionAmongCompetitors}`
                    : "N/A"}
                </p>
              </div>
            </div>

            {source.extractedEntities.competitorNamesFound.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-text-tertiary mb-2">Competitors Found</p>
                <div className="flex flex-wrap gap-1.5">
                  {source.extractedEntities.competitorNamesFound.map((name, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-lg bg-surface-2 px-2 py-0.5 text-xs text-text-secondary"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {source.extractedEntities.citedDomains.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-text-tertiary mb-2">Cited Domains</p>
                <div className="flex flex-wrap gap-1.5">
                  {source.extractedEntities.citedDomains.map((domain, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-lg bg-surface-2 px-2 py-0.5 text-xs font-mono tabular-nums text-text-secondary"
                    >
                      {domain}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {source.extractedEntities.citedDomainTypes.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-text-tertiary mb-2">Cited Domain Types</p>
                <div className="flex flex-wrap gap-1.5">
                  {source.extractedEntities.citedDomainTypes.map((type, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-lg bg-accent-muted px-2 py-0.5 text-xs text-accent"
                    >
                      {type.type}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </Drawer>
    </>
  );
}
