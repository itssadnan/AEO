"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/db";
import { checkRateLimit } from "@/lib/security";
import { createWorkspace, normalizeEmail, signInSchema, signUpSchema } from "@/modules/auth";

/**
 * Signup: validates input, rate-limits by IP (Module 5.1 acceptance
 * criteria — same pattern 5.11 will reuse), creates the Supabase Auth user,
 * then bootstraps a Free workspace for them. Redirects with an `error` query
 * param on failure rather than returning a value, so the page stays a plain
 * Server Component (no client-side form-state hook needed).
 */
export async function signUpAction(formData: FormData): Promise<void> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    workspaceName: formData.get("workspaceName"),
  });

  if (!parsed.success) {
    redirect(
      `/sign-up?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`,
    );
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitClient = createSupabaseServiceRoleClient();
  const rate = await checkRateLimit(rateLimitClient, {
    key: `signup:${ip}`,
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,
  });

  if (!rate.allowed) {
    redirect(
      `/sign-up?error=${encodeURIComponent("Too many signup attempts from this network. Try again later.")}`,
    );
  }

  // Pre-check for an existing identity with the same normalized email before
  // ever calling signUp(). user_profiles.normalized_email has a hard unique
  // constraint (migration 0001 — "at most one identity per real inbox",
  // deliberate, not just a workspace-level rule) enforced by the
  // handle_new_user() trigger on auth.users. That's correct for data
  // integrity, but Supabase Auth (GoTrue) can't surface a friendly message
  // when a trigger aborts its transaction — it always collapses to an opaque
  // "Database error saving new user" 500. Catching the collision here, with
  // the service-role client (user_profiles has no anon/authenticated select
  // policy for other users' rows), lets us show a clean error instead of
  // letting a doomed signUp() call reach Postgres. This mirrors the intent
  // already documented on normalizeEmail() in modules/auth/email.ts ("so the
  // UI/API layer can show a same-email error before round-tripping to
  // Postgres") — it just wasn't wired up here yet.
  //
  // Note: this is a best-effort check, not a lock — two concurrent signups
  // for the same inbox could both pass it. The DB constraint is still the
  // real backstop in that rare race; only the UX degrades back to the
  // generic error, data integrity is unaffected.
  const normalizedEmail = normalizeEmail(parsed.data.email);
  const { data: existingProfile, error: profileLookupError } = await rateLimitClient
    .from("user_profiles")
    .select("id")
    .eq("normalized_email", normalizedEmail)
    .maybeSingle();

  if (profileLookupError) {
    console.error("user_profiles duplicate-email lookup failed", profileLookupError);
    // Fail open: don't block a legitimate signup on a lookup hiccup. Worst
    // case is falling back to the pre-existing (already logged) crash path.
  }

  if (existingProfile) {
    redirect(
      `/sign-up?error=${encodeURIComponent("An account already exists for this email. Sign in instead.")}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Without this, Supabase falls back to whatever "Site URL" is
      // configured in the dashboard (Authentication -> URL Configuration),
      // and the confirmation link lands the user on a plain page that never
      // exchanges the PKCE code for a session — so a confirmed user would
      // never actually get signed in or get a workspace created. Routing
      // through /auth/callback (the same route Google OAuth already uses)
      // means confirmation goes through exchangeCodeForSession() and the
      // same first-time-user workspace bootstrap logic. That fallback names
      // the workspace from the email prefix rather than the workspaceName
      // typed on this form, since that value isn't available by the time a
      // separate confirmation-link request comes in — an acceptable
      // trade-off already accepted for first-time Google sign-ins.
      //
      // This redirect target must be present in Supabase's Redirect URLs
      // allow-list (Authentication -> URL Configuration) or Supabase will
      // reject/ignore it — see progress/modules/5.1-auth-and-account.md.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    console.error("signUp failed", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    redirect(`/sign-up?error=${encodeURIComponent(error.message)}`);
  }

  if (!data.user) {
    console.error("signUp returned no error but no user either", { data });
    redirect(`/sign-up?error=${encodeURIComponent("Sign-up did not complete. Please try again.")}`);
  }

  console.error("signUp result", {
    hasUser: Boolean(data.user),
    hasSession: Boolean(data.session),
    identitiesCount: data.user?.identities?.length,
  });

  // If email confirmation is required, signUp() succeeds but returns no
  // session — the caller isn't authenticated yet, so an RLS-protected RPC
  // like create_workspace would fail (executed as `anon`, not
  // `authenticated`). Defer workspace creation until the user actually
  // confirms and signs in, rather than attempting it now and swallowing a
  // confusing permission error.
  if (data.user && !data.session) {
    redirect(
      `/sign-up?error=${encodeURIComponent("Check your email to confirm your account before signing in.")}`,
    );
  }

  if (data.user && data.session) {
    const result = await createWorkspace(supabase, { name: parsed.data.workspaceName });
    if ("error" in result) {
      console.error("createWorkspace failed", result);
      redirect(`/sign-up?error=${encodeURIComponent(result.message)}`);
    }
  }

  redirect("/dashboard");
}

export async function signInAction(formData: FormData): Promise<void> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(
      `/sign-in?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    console.error("signInWithPassword failed", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    redirect(`/sign-in?error=${encodeURIComponent("Invalid email or password")}`);
  }

  redirect("/dashboard");
}

export async function signInWithGoogleAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;
  console.error("signInWithGoogle redirectTo", {
    redirectTo,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error || !data.url) {
    console.error("signInWithOAuth failed", {
      status: error?.status,
      code: error?.code,
      message: error?.message,
    });
    redirect(`/sign-in?error=${encodeURIComponent("Google sign-in failed to start")}`);
  }

  redirect(data.url);
}
