import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type CreateWorkspaceResult =
  { workspaceId: string } | { error: "FREE_WORKSPACE_EXISTS" | "UNKNOWN"; message: string };

/**
 * Calls the create_workspace() Postgres function (see migration 0001), which
 * atomically creates the workspace row, the caller's owner workspace_members
 * row, and enforces the one-Free-workspace-per-normalized-email rule inside a
 * single transaction. See that migration for why this can't be a plain
 * client-side insert into `workspaces`.
 */
export async function createWorkspace(
  supabase: SupabaseClient<Database>,
  params: { name: string; planTier?: "free" | "starter" | "growth" | "agency" },
): Promise<CreateWorkspaceResult> {
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: params.name,
    p_plan_tier: params.planTier ?? "free",
  });

  if (error) {
    if (error.message.includes("FREE_WORKSPACE_EXISTS")) {
      return {
        error: "FREE_WORKSPACE_EXISTS",
        message: "This email already has a free workspace — upgrade it or log in.",
      };
    }
    return { error: "UNKNOWN", message: error.message };
  }

  return { workspaceId: data };
}
