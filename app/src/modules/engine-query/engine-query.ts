import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { freeCheckRequestSchema, type FreeCheckRequest } from "./schemas.ts";

export async function enqueueFreeCheck(
  supabase: SupabaseClient<Database>,
  input: FreeCheckRequest,
): Promise<{ jobId: string } | { error: string }> {
  const parsed = freeCheckRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid check request." };
  const { data, error } = await supabase.rpc("enqueue_free_check", {
    p_workspace_id: parsed.data.workspaceId,
    p_brand_id: parsed.data.brandId,
    p_prompt_id: parsed.data.promptId,
  });
  if (error) {
    if (error.message.includes("FREE_EXPERIMENT_CAP_REACHED"))
      return { error: "You've used all 3 free visibility checks. Upgrade to run more checks." };
    if (error.message.includes("CHECK_ALREADY_QUEUED"))
      return { error: "This prompt already has a check waiting to run." };
    return { error: "We couldn't queue that check. Please try again." };
  }
  return { jobId: data };
}
