import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

/**
 * Dashboard route-group root ("/"). Redirects to /overview.
 *
 * This used to be a full standalone Overview implementation, duplicating
 * app/src/app/(dashboard)/overview/page.tsx (same query logic, but without
 * that route's brandId/engine search-param support or its no-brands empty
 * state matching the rest of the dashboard) -- found during independent
 * verification alongside the mapPlanTier duplication bug. Reduced to a
 * redirect so there is exactly one Overview implementation, per this
 * module's own "don't duplicate a shared utility/view" lesson.
 */
export default async function DashboardRootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  redirect("/overview");
}
