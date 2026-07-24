import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db";
import { PROMPT_LIMIT_BY_PLAN_TIER, type PlanTier } from "@/modules/brand-config";
import { BrandForm } from "./brand-form";

/**
 * Minimal first pass at Module 5.2's brand-creation UI. Deliberately picks
 * the user's first workspace rather than offering a switcher — the
 * multi-workspace agency UX (workspace picker, brand list, etc.) belongs to
 * Module 5.6's real dashboard, not this module. This page exists so 5.2's
 * acceptance criteria (manual entry + AI-assisted prompt suggestion +
 * plan-tier-aware prompt handling) have a real, testable surface, the same
 * way Module 5.1's placeholder /dashboard existed to give the auth flow a
 * real landing spot.
 */
export default async function NewBrandPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    // Shouldn't happen — create_workspace() runs at signup (Module 5.1) —
    // but fail safe rather than crash if it somehow does.
    redirect("/dashboard");
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, plan_tier")
    .eq("id", membership.workspace_id)
    .single();

  if (!workspace) {
    redirect("/dashboard");
  }

  // Viewers are read-only (spec 5.1: "agencies invite client-side viewers
  // to their own brand only") — RLS is the real gate (migration 0005's
  // brands_insert_owner_or_member policy), this is just the UI-level
  // courtesy per docs/CONVENTIONS.md's "app checks decide what UI shows"
  // convention.
  if (membership.role === "viewer") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-24">
        <h1 className="text-2xl font-semibold">Add a brand</h1>
        <p className="text-zinc-600">
          You have view-only access to this workspace. Ask an owner or member to add a brand.
        </p>
      </div>
    );
  }

  const planTier = (workspace.plan_tier as PlanTier) ?? "free";
  // Computed here (Server Component) rather than in BrandForm, so the
  // client bundle never needs a runtime import from @/modules/brand-config
  // at all -- see the limit prop's doc-comment on BrandForm for why that
  // matters (a Turbopack build failure this caused, fixed 2026-07-24).
  const limit = PROMPT_LIMIT_BY_PLAN_TIER[planTier];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-24">
      <div>
        <h1 className="text-2xl font-semibold">Add a brand</h1>
        <p className="text-zinc-600">
          Workspace: {workspace.name} ({planTier} plan)
        </p>
      </div>
      <BrandForm workspaceId={workspace.id} planTier={planTier} limit={limit} />
    </div>
  );
}
