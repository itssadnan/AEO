"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db";
import {
  createBrandSchema,
  createBrandWithDetails,
  promptSuggestionRequestSchema,
  suggestPrompts,
  type PlanTier,
} from "@/modules/brand-config";

export type SuggestPromptsState = { prompts: string[] } | { error: string };

/**
 * Server Action backing the "Suggest prompts" button in BrandForm. Requires
 * a signed-in session (this is not the public free-check tool, so no
 * separate IP rate limit here per docs/CONVENTIONS.md Section 6 item 4 —
 * that rule is scoped to public/unauthenticated endpoints only) but does
 * not check workspace role, since it makes no database write; the actual
 * brand/prompt writes in createBrandAction below are what RLS gates.
 */
export async function suggestPromptsAction(input: {
  brandName: string;
  website?: string;
}): Promise<SuggestPromptsState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const parsed = promptSuggestionRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid brand details" };
  }

  return suggestPrompts(parsed.data);
}

export type CreateBrandState = { error: string } | { ok: true };

export async function createBrandAction(input: {
  workspaceId: string;
  planTier: PlanTier;
  name: string;
  website?: string;
  competitorNames: string[];
  promptTexts: string[];
  promptsAiSuggested: boolean;
}): Promise<CreateBrandState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const schema = createBrandSchema(input.planTier);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createBrandWithDetails(supabase, input.workspaceId, parsed.data);
  if ("error" in result) {
    return { error: result.error };
  }

  // Real per-brand dashboard is Module 5.6 — land back on the placeholder
  // dashboard for now, same pattern Module 5.1 used for post-signup.
  redirect("/dashboard");
}
