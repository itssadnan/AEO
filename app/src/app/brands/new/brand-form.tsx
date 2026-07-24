"use client";

import { useState, useTransition } from "react";
// Type-only import: erased entirely at compile time, so this creates no
// runtime dependency on the module barrel and pulls nothing (including
// gemini.ts's "server-only" chain) into the client bundle. Do NOT change
// this to a value import of anything from @/modules/brand-config here --
// that's exactly what broke the Vercel production build on 2026-07-24
// (Turbopack correctly refused to bundle "server-only" code into a Client
// Component). Any value this component needs from that module (e.g.
// PROMPT_LIMIT_BY_PLAN_TIER) must be computed server-side in page.tsx and
// passed down as a plain prop instead, the way `limit` is below.
import type { PlanTier } from "@/modules/brand-config";
import { createBrandAction, suggestPromptsAction } from "./actions";

/**
 * Free-plan prompt lists are auto-selected from the AI suggestions and
 * fixed (spec Section 5.2) — this component enforces that in the UI by
 * hiding edit controls entirely for `planTier === "free"`, but the real
 * enforcement is the DB trigger in migration 0005
 * (private.enforce_prompt_plan_rules), not this component. If this ever
 * disagrees with the trigger, the trigger wins.
 */
export function BrandForm({
  workspaceId,
  planTier,
  limit,
}: {
  workspaceId: string;
  planTier: PlanTier;
  /** PROMPT_LIMIT_BY_PLAN_TIER[planTier], computed server-side in page.tsx -- see the import comment above for why this isn't computed here. */
  limit: number;
}) {
  const isFree = planTier === "free";

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [competitorsText, setCompetitorsText] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [manualPromptsText, setManualPromptsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSuggesting, startSuggesting] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();

  function handleSuggest() {
    setError(null);
    startSuggesting(async () => {
      const result = await suggestPromptsAction({ brandName: name, website: website || undefined });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const capped = isFree ? result.prompts.slice(0, limit) : result.prompts;
      setSuggested(capped);
      setSelected(new Set(capped.map((_, i) => i)));
    });
  }

  function toggleSelected(i: number) {
    if (isFree) return; // fixed list on Free — no picking/unpicking
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleSubmit() {
    setError(null);

    const competitorNames = competitorsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const chosenSuggested = suggested.filter((_, i) => selected.has(i));
    const manualPrompts = isFree
      ? []
      : manualPromptsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);

    const promptTexts = [...chosenSuggested, ...manualPrompts];
    if (promptTexts.length === 0) {
      setError("Add at least one prompt — use Suggest prompts or enter your own.");
      return;
    }

    startSubmitting(async () => {
      const result = await createBrandAction({
        workspaceId,
        planTier,
        name,
        website: website || undefined,
        competitorNames,
        // Free plan: every stored prompt must be AI-suggested (enforced by
        // the DB trigger too) — chosenSuggested only, manualPrompts is
        // forced empty above for isFree. Paid plans: a mixed batch is
        // fine, so we tag the whole batch is_ai_suggested=true only when
        // every prompt actually came from suggestions.
        promptTexts,
        promptsAiSuggested:
          manualPrompts.length === 0 && chosenSuggested.length === promptTexts.length,
      });
      if ("error" in result) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Brand name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border px-3 py-2"
            placeholder="Acme CRM"
            maxLength={200}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Website
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="rounded border px-3 py-2"
            placeholder="https://acme.com"
            maxLength={500}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Competitors (one per line, up to 20)
          <textarea
            value={competitorsText}
            onChange={(e) => setCompetitorsText(e.target.value)}
            className="min-h-20 rounded border px-3 py-2"
            placeholder={"Competitor A\nCompetitor B"}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSuggest}
          disabled={!name.trim() || isSuggesting}
          className="w-fit rounded border px-3 py-2 disabled:opacity-50"
        >
          {isSuggesting ? "Suggesting…" : "Suggest prompts with AI"}
        </button>
        {suggested.length > 0 && (
          <div className="flex flex-col gap-1 rounded border p-3">
            <p className="text-sm text-zinc-600">
              {isFree
                ? `Your Free plan uses the first ${Math.min(limit, suggested.length)} suggestions below, fixed — upgrade to customize.`
                : "Pick the prompts to track (uncheck any you don't want):"}
            </p>
            <ul className="flex flex-col gap-1">
              {suggested.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleSelected(i)}
                    disabled={isFree}
                  />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!isFree && (
        <label className="flex flex-col gap-1 text-sm">
          Add your own prompts (one per line, up to {limit} total across suggested + manual)
          <textarea
            value={manualPromptsText}
            onChange={(e) => setManualPromptsText(e.target.value)}
            className="min-h-20 rounded border px-3 py-2"
            placeholder={"best CRM for a 10-person agency\nCRM with the best onboarding"}
          />
        </label>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!name.trim() || isSubmitting}
        className="w-fit rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {isSubmitting ? "Creating…" : "Create brand"}
      </button>
    </div>
  );
}
