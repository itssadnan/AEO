import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db";

// Placeholder — the real dashboard UI is Module 5.6. This exists so Module
// 5.1's auth flow has a real, auth-gated destination to land on and verify
// against, rather than 404ing after a successful sign-in.
export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id);

  const workspaceIds = (memberships ?? []).map((m) => m.workspace_id);
  const { data: workspaces } =
    workspaceIds.length > 0
      ? await supabase.from("workspaces").select("id, name").in("id", workspaceIds)
      : { data: [] as { id: string; name: string }[] };

  const workspaceNameById = new Map((workspaces ?? []).map((w) => [w.id, w.name]));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-24">
      <h1 className="text-2xl font-semibold">Welcome, {user.email}</h1>
      <p className="text-zinc-600">Signed in. Your workspaces:</p>
      <ul className="list-disc pl-6">
        {(memberships ?? []).map((m) => (
          <li key={m.workspace_id}>
            {workspaceNameById.get(m.workspace_id) ?? m.workspace_id} ({m.role})
          </li>
        ))}
      </ul>
    </div>
  );
}
