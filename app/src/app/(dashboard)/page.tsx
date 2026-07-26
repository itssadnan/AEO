import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import {
  getBrandWithRelations,
  computeOverviewMetrics,
  getEmptyStateConfig,
  mapPlanTier,
} from "@/modules/dashboard/queries";
import { Header } from "./header";
import { Navigation } from "./navigation";
import { OverviewView } from "./overview-view";

type UserRole = "owner" | "member" | "viewer";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Get user's workspace memberships
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id);

  const workspaceIds = (memberships ?? []).map((m) => m.workspace_id);

  const { data: workspaces } =
    workspaceIds.length > 0
      ? await supabase.from("workspaces").select("id, name, plan_tier").in("id", workspaceIds)
      : { data: [] as { id: string; name: string; plan_tier: string }[] };

  const workspaceById = new Map((workspaces ?? []).map((w) => [w.id, w]));

  // Get user's brands (first brand for now - brand switcher in navigation)
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name, workspace_id")
    .in("workspace_id", workspaceIds)
    .limit(1);

  if (!brands || brands.length === 0) {
    // No brands yet - show empty state / onboarding
    return (
      <div className="flex h-screen">
        <Navigation
          userEmail={user.email ?? ""}
          workspaceName={workspaces?.[0]?.name ?? "Workspace"}
          planTier={
            (workspaces?.[0]?.plan_tier as "free" | "starter" | "growth" | "agency") ?? "free"
          }
          brands={[]}
          selectedBrandId={null}
          userRole="member"
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            userEmail={user.email ?? ""}
            workspaceName={workspaces?.[0]?.name ?? "Workspace"}
            planTier={
              (workspaces?.[0]?.plan_tier as "free" | "starter" | "growth" | "agency") ?? "free"
            }
          />
          <main className="flex-1 overflow-auto p-6">
            <div className="mx-auto max-w-4xl text-center py-24">
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
          </main>
        </div>
      </div>
    );
  }

  const brand = brands[0];
  const workspace = workspaceById.get(brand.workspace_id)!;

  // Fetch brand data with relations
  const [brandWithRelations, overview, emptyState] = await Promise.all([
    getBrandWithRelations(brand.id),
    computeOverviewMetrics(brand.id, "gemini"),
    getEmptyStateConfig(brand.id),
  ]);

  if (!brandWithRelations) {
    redirect("/dashboard");
  }

  // Find user's role for this workspace
  const membership = memberships?.find((m) => m.workspace_id === brand.workspace_id);
  const userRole: UserRole = (membership?.role as UserRole) ?? "member";

  const planTier = mapPlanTier(workspace.plan_tier);

  return (
    <div className="flex h-screen">
      <Navigation
        userEmail={user.email ?? ""}
        workspaceName={workspace.name}
        planTier={planTier}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        selectedBrandId={brand.id}
        userRole={userRole}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header userEmail={user.email ?? ""} workspaceName={workspace.name} planTier={planTier} />
        <main className="flex-1 overflow-auto p-6">
          <OverviewView
            brand={brandWithRelations}
            overview={overview}
            emptyState={emptyState}
            competitors={brandWithRelations.competitors}
            prompts={brandWithRelations.prompts}
            workspace={{ ...workspace, plan_tier: planTier }}
          />
        </main>
      </div>
    </div>
  );
}
