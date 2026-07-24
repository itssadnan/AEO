import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client — bypasses RLS entirely. The `server-only`
 * import above makes an accidental client-bundle import a build-time error,
 * not just a code-review convention (docs/CONVENTIONS.md Section 6, item 2).
 * Reserved for: Module 5.10 Admin Console, webhook handlers, and the
 * signup rate-limiter below — trusted server-side code that must act without
 * being scoped to one workspace's RLS.
 */
export function createSupabaseServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
