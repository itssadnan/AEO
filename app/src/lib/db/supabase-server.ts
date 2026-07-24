import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 * Runs with the calling user's session — RLS applies normally. Never use this
 * for admin-only/cross-tenant operations; see supabase-service-role.ts.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component, where cookies() is read-only —
            // safe to ignore because middleware.ts refreshes the session on
            // every request instead.
          }
        },
      },
    },
  );
}
