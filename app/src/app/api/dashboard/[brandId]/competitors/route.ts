import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { getCompetitorExplorerData } from "@/modules/dashboard/queries";
import { engineParamSchema } from "@/modules/dashboard/api-schemas";

/**
 * Backs Competitor Explorer's client-side data load (competitor-explorer-
 * view.tsx's fetchCompetitorData). Same missing-route bug and same fix as
 * app/api/dashboard/[brandId]/prompts/route.ts -- see that file's
 * doc-comment for the full story and the RLS-based auth reasoning, which
 * applies identically here (competitors/check_runs/check_extractions all
 * carry the same `*_select_member` RLS policy pattern).
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

  const data = await getCompetitorExplorerData(brandId, parsedEngine.data);
  return NextResponse.json(data);
}
