import { z } from "zod";

/**
 * Per-brand prompt-count limits by plan tier. Mirrors the numbers enforced
 * for real by the `private.enforce_prompt_plan_rules()` trigger in
 * migration 0005 — that trigger is the actual security boundary (per
 * docs/CONVENTIONS.md Section 6 item 1, RLS/DB triggers are the real gate,
 * not app code). This copy exists only so the UI can show a sensible
 * max-length error before round-tripping to Postgres, same rationale as
 * normalizeEmail() mirroring normalize_email() in Module 5.1. If these ever
 * drift from the migration, the migration wins — update this to match it,
 * not the other way around.
 */
export const PROMPT_LIMIT_BY_PLAN_TIER = {
  free: 10,
  starter: 25,
  growth: 75,
  agency: 200,
} as const;

export type PlanTier = keyof typeof PROMPT_LIMIT_BY_PLAN_TIER;

const brandNameSchema = z.string().trim().min(1, "Brand name is required").max(200);

const websiteSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === "" || /^https?:\/\/.+/i.test(v),
    "Enter a full URL starting with http:// or https://",
  )
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const competitorNameSchema = z.string().trim().min(1).max(200);

export const promptSuggestionRequestSchema = z.object({
  brandName: brandNameSchema,
  website: websiteSchema,
});
export type PromptSuggestionRequest = z.infer<typeof promptSuggestionRequestSchema>;

/** Shape Gemini's structured-output response must satisfy before we trust it. */
export const promptSuggestionResponseSchema = z.object({
  prompts: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
});
export type PromptSuggestionResponse = z.infer<typeof promptSuggestionResponseSchema>;

const promptTextSchema = z.string().trim().min(1, "Prompt text cannot be empty").max(500);

/**
 * Full brand-creation payload. `planTier` decides the prompt-count ceiling
 * applied here (UX only, see the module doc-comment above) and, on the
 * Free tier, whether prompts are allowed to be non-AI-suggested at all
 * (they aren't — Free-plan lists are auto-selected and fixed, matching the
 * DB trigger's `prompt_must_be_ai_suggested_on_free_plan` check).
 */
export function createBrandSchema(planTier: PlanTier) {
  const limit = PROMPT_LIMIT_BY_PLAN_TIER[planTier];
  return z.object({
    name: brandNameSchema,
    website: websiteSchema,
    competitorNames: z.array(competitorNameSchema).max(20, "Up to 20 competitors"),
    promptTexts: z
      .array(promptTextSchema)
      .min(1, "At least one prompt is required")
      .max(limit, `The ${planTier} plan allows up to ${limit} prompts per brand`),
    promptsAiSuggested: z.boolean(),
  });
}
export type CreateBrandInput = z.infer<ReturnType<typeof createBrandSchema>>;
