/**
 * Module 5.9 — read-only queries. Deliberately uncached (this module's own
 * Caching decision, progress/modules/5.9-billing-and-subscription.md:
 * "billing state must always read as current, never stale") -- every call
 * here hits Postgres directly, no revalidate/cache wrapper.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PLAN_CATALOG, type PlanTierId } from "./plans";

export type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

/**
 * The current subscription row for a workspace, or null if the workspace
 * has never started a paid checkout (the common case -- most workspaces
 * stay on `free` and have no `subscriptions` row at all, per migration
 * 0023's design: the row is only created by create_pending_subscription).
 * RLS (subscriptions_select_member) already scopes this to the caller's own
 * workspace membership -- no extra check needed here.
 */
export async function getSubscriptionForWorkspace(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export interface UsageSnapshot {
  brandCount: number;
  promptCount: number;
  brandLimit: number;
  promptLimit: number;
  planTier: PlanTierId;
}

/**
 * Real current usage vs. real plan limits, for the Settings > Billing
 * "Usage This Period" panel -- replaces the previous hardcoded
 * `1 / {free ? 1 : "∞"}` display, which was never actually reading the real
 * per-tier numbers this module (and migrations 0005/0023) now enforce
 * server-side.
 *
 * `brandId` is required, not optional: migration 0005's
 * enforce_prompt_plan_rules trigger enforces the prompt limit *per brand*
 * (`select count(*) from prompts where brand_id = new.brand_id`), not
 * summed across every brand in a workspace, so promptCount/promptLimit here
 * are correctly scoped to the one brand the Settings page is showing, while
 * brandCount/brandLimit (migration 0023's trigger) are correctly scoped to
 * the whole workspace -- these two counters have deliberately different
 * scopes because that's what the two triggers they mirror actually check.
 */
export async function getUsageSnapshot(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  brandId: string,
  planTier: PlanTierId,
): Promise<UsageSnapshot> {
  const [{ count: brandCount }, { count: promptCount }] = await Promise.all([
    supabase
      .from("brands")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    supabase.from("prompts").select("id", { count: "exact", head: true }).eq("brand_id", brandId),
  ]);

  const plan = PLAN_CATALOG[planTier];

  return {
    brandCount: brandCount ?? 0,
    promptCount: promptCount ?? 0,
    brandLimit: plan.brandLimit,
    promptLimit: plan.promptLimit,
    planTier,
  };
}
