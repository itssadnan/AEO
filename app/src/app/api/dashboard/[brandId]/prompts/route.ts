import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { getPromptExplorerData } from "@/modules/dashboard/queries";
import { engineParamSchema } from "@/modules/dashboard/api-schemas";

/**
 * Backs Prompt Explorer's client-side data load (prompt-explorer-view.tsx's
 * fetchPromptData). This route did not exist at all until 2026-09-02 --
 * every plan tier's Prompt Explorer page was permanently stuck on its
 * "No prompt data yet" empty state because this fetch 404'd on every load,
 * confirmed live via the browser network log and Vercel's runtime logs.
 *
 * Auth: rejects unauthenticated callers explicitly (401), then relies on
 * the same request-scoped, RLS-respecting Supabase client every Server
 * Component page in this module already uses -- brands/prompts/
 * check_runs/check_extractions all carry a `*_select_member` RLS policy
 * (migrations 0005, 0007, 0013) that only returns rows for a workspace the
 * caller belongs to, so a brandId the caller doesn't own resolves to an
 * empty result here, never another workspace's data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { brandId } = await params;
  const parsedEngine = engineParamSchema.safeParse(
    request.nextUrl.searchParams.get("engine") ?? undefined,
  );
  if (!parsedEngine.success) {
    return NextResponse.json({ error: "Invalid engine" }, { status: 400 });
  }

  const data = await getPromptExplorerData(brandId, parsedEngine.data);
  return NextResponse.json(data);
}
