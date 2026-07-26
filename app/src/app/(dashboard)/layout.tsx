import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { Navigation } from "./navigation";
import { Header } from "./header";

/**
 * Dashboard route group layout — Module 5.6
 *
 * Shared layout for all dashboard views (Overview, Prompt Explorer,
 * Competitor Explorer, Reports, Settings). Provides auth guard,
 * workspace/brand context, and persistent navigation/header.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Get user's first workspace membership
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

  // Get user's brands in this workspace
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-surface-0)]">
      <Header
        userEmail={user.email ?? "User"}
        workspaceName={workspace.name}
        planTier={workspace.plan_tier as "free" | "starter" | "growth" | "agency"}
      />
      <div className="flex flex-1">
        <Navigation
          userEmail={user.email ?? "User"}
          workspaceName={workspace.name}
          planTier={workspace.plan_tier as "free" | "starter" | "growth" | "agency"}
          brands={brands ?? []}
          selectedBrandId={null}
          userRole={membership.role as "owner" | "member" | "viewer"}
        />
        <main className="flex-1 p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
