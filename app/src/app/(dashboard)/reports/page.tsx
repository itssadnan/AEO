import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { ReportsView } from "../reports-view";
import {
  getBrandWithRelations,
  computeOverviewMetrics,
  getEmptyStateConfig,
  mapPlanTier,
} from "@/modules/dashboard/queries";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    brandId?: string;
    engine?: "gemini" | "nvidia-nim";
    period?: "7d" | "30d" | "90d";
  }>;
}) {
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
    redirect("/sign-in");
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, plan_tier")
    .eq("id", membership.workspace_id)
    .single();

  if (!workspace) {
    redirect("/sign-in");
  }

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: true });

  const params = await searchParams;
  const brandId = params.brandId ?? brands?.[0]?.id;
  const engine = params.engine ?? "gemini";
  // Note: `period` isn't wired up yet — ReportsView manages its own period state
  // client-side (defaults to "30d") rather than accepting it as a prop. The
  // `?period=` search param is accepted here for a future deep-link feature but
  // currently has no effect; not removing the type since the URL contract is
  // intentional, just not yet consumed.

  if (!brandId) {
    return (
      <div className="mx-auto max-w-4xl py-24 text-center">
        <h1 className="text-3xl font-semibold text-[var(--color-text-primary)] mb-4">
          No brands yet
        </h1>
        <p className="text-[var(--color-text-secondary)] mb-8 max-w-md mx-auto">
          Add your first brand to start tracking AI visibility across answer engines.
        </p>
        <a
          href="/brands/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          Add brand
        </a>
      </div>
    );
  }

  const [brandWithRelations, overview, emptyState] = await Promise.all([
    getBrandWithRelations(brandId),
    computeOverviewMetrics(brandId, engine),
    getEmptyStateConfig(brandId),
  ]);

  if (!brandWithRelations) {
    redirect("/dashboard");
  }

  return (
    <ReportsView
      brand={brandWithRelations}
      overview={overview}
      emptyState={emptyState}
      competitors={brandWithRelations.competitors}
      prompts={brandWithRelations.prompts}
      workspace={{ ...workspace, plan_tier: mapPlanTier(workspace.plan_tier) }}
    />
  );
}
