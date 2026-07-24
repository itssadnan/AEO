"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/db";
import { checkRateLimit } from "@/lib/security";
import { createWorkspace, signInSchema, signUpSchema } from "@/modules/auth";

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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    redirect(`/sign-up?error=${encodeURIComponent(error.message)}`);
  }

  if (data.user) {
    const result = await createWorkspace(supabase, { name: parsed.data.workspaceName });
    if ("error" in result) {
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
    redirect(`/sign-in?error=${encodeURIComponent("Invalid email or password")}`);
  }

  redirect("/dashboard");
}

export async function signInWithGoogleAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect(`/sign-in?error=${encodeURIComponent("Google sign-in failed to start")}`);
  }

  redirect(data.url);
}
