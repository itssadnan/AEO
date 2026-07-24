import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/db";
import { createWorkspace } from "@/modules/auth";

/**
 * OAuth (Google) callback and email-confirmation redirect target. Exchanges
 * the code for a session, then bootstraps a Free workspace for brand-new
 * users who don't have one yet. Email/password signup does this synchronously
 * in signUpAction instead, so in practice this branch only fires for
 * first-time Google sign-ins.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: memberships, error: membershipError } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (membershipError) {
      return NextResponse.redirect(
        `${origin}/sign-in?error=${encodeURIComponent(membershipError.message)}`,
      );
    }

    if (memberships.length === 0) {
      const result = await createWorkspace(supabase, {
        name: user.email ? `${user.email.split("@")[0]}'s workspace` : "My workspace",
      });
      if ("error" in result) {
        return NextResponse.redirect(
          `${origin}/sign-in?error=${encodeURIComponent(result.message)}`,
        );
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
