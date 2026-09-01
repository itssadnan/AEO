import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { getReportData } from "@/modules/dashboard/queries";
import { buildReportCsv, buildReportPdfLines } from "@/modules/dashboard/report-export";
import { buildSimpleTextPdf } from "@/lib/pdf/simple-pdf";
import {
  engineParamSchema,
  periodParamSchema,
  reportExportRequestSchema,
  resolvePeriodBounds,
} from "@/modules/dashboard/api-schemas";

/**
 * GET backs Reports' client-side data load (reports-view.tsx's
 * fetchReportData) -- same missing-route bug as the prompts/competitors
 * routes in this same api/dashboard/[brandId]/ tree; see those files'
 * doc-comments for the full story and the RLS-based auth reasoning, which
 * applies identically here.
 *
 * POST backs the "Export PDF"/"Export CSV" buttons -- this endpoint did
 * not exist at all before 2026-09-02, so both buttons always failed with
 * "Failed to generate report" the moment a paying customer clicked them
 * (unreachable in practice, since Reports itself was fully locked for
 * every non-Agency-gated flow at the time -- see reports-view.tsx's
 * decisions-log entry, same date).
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
  const parsedPeriod = periodParamSchema.safeParse(
    request.nextUrl.searchParams.get("period") ?? undefined,
  );
  if (!parsedEngine.success || !parsedPeriod.success) {
    return NextResponse.json({ error: "Invalid engine or period" }, { status: 400 });
  }

  const { periodStart, periodEnd } = resolvePeriodBounds(parsedPeriod.data);
  const report = await getReportData(brandId, periodStart, periodEnd, parsedEngine.data);
  if (!report) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  return NextResponse.json(report);
}

export async function POST(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = reportExportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid export request" }, { status: 400 });
  }
  const { engine, period, format } = parsed.data;

  const { brandId } = await params;
  const { periodStart, periodEnd } = resolvePeriodBounds(period);
  const report = await getReportData(brandId, periodStart, periodEnd, engine);
  if (!report) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const filenameSafeBrand = report.brandName.replace(/[^a-zA-Z0-9_-]+/g, "-");

  if (format === "csv") {
    const csv = buildReportCsv(report);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameSafeBrand}-report-${period}.csv"`,
      },
    });
  }

  const pdf = buildSimpleTextPdf(buildReportPdfLines(report));
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameSafeBrand}-report-${period}.pdf"`,
    },
  });
}
