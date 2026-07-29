import { normalizeEmail } from "@/modules/auth/email";
import { createSupabaseServerClient } from "@/lib/db";

/**
 * Returns null if the currently signed-in user's normalized email is in
 * ADMIN_USER_EMAILS (server-only env var, comma-separated, never
 * NEXT_PUBLIC_). Returns an error object otherwise. Call this at the top
 * of every admin Server Action AND in the admin route's page.tsx (defense
 * in depth — docs/CONVENTIONS.md Section 6 item: "Gate at the server/API
 * layer by role check, not just by hiding a frontend link").
 */
export async function requireAdmin(clientOverride?: unknown): Promise<{ error: string } | null> {
  const supabase = clientOverride
    ? (clientOverride as Awaited<ReturnType<typeof createSupabaseServerClient>>)
    : await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "You must be signed in." };

  const allowlist = (process.env.ADMIN_USER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map(normalizeEmail);

  if (!allowlist.includes(normalizeEmail(user.email))) {
    return { error: "Not authorized." };
  }
  return null;
}