import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { CreateBrandInput } from "./schemas";

export type CreateBrandResult = { brandId: string } | { error: string };

/**
 * Calls the create_brand_with_details() Postgres function (migration 0006),
 * which inserts the brand + competitors + prompts in one call so a failed
 * prompt insert (e.g. the Free-plan trigger in migration 0005 rejecting a
 * non-AI-suggested prompt, or an over-the-limit count) rolls back the whole
 * thing instead of leaving a brand with a partial prompt list. Unlike
 * create_workspace() in Module 5.1, this RPC is SECURITY INVOKER — it runs
 * as the calling user, so the normal brands/competitors/prompts RLS
 * policies from migration 0005 are what actually decide whether the call
 * succeeds. This wrapper adds nothing security-relevant of its own; it
 * only shapes the client call and the error result.
 */
export async function createBrandWithDetails(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  input: CreateBrandInput,
): Promise<CreateBrandResult> {
  const { data, error } = await supabase.rpc("create_brand_with_details", {
    p_workspace_id: workspaceId,
    p_name: input.name,
    p_website: input.website ?? "",
    p_competitor_names: input.competitorNames,
    p_prompt_texts: input.promptTexts,
    p_prompts_ai_suggested: input.promptsAiSuggested,
  });

  if (error) {
    // Surface the DB trigger's own message where we can — it's already a
    // clear, user-safe string (see migration 0005's raise exception text),
    // not sensitive internal detail.
    return { error: error.message };
  }

  return { brandId: data };
}
