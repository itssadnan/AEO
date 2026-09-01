import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseServiceRoleClient } from "@/lib/db/supabase-service-role";
import type {
  BrandWithRelations,
  OverviewMetrics,
  PromptExplorerRow,
  CompetitorExplorerRow,
  ReportData,
  PlanTier,
  EmptyStateConfig,
} from "./types";
import type { VisibilitySnapshotRow } from "./database-extensions";
import type { ExplanationEngineData } from "./types";
import { shapeExplanationEngineData } from "./explanation-engine";

// Type assertion helper for tables not yet in generated types
const supabaseFrom = (
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: string,
) =>
  // visibility_snapshots and brand_subscriptions (see database-extensions.ts) aren't in the
  // generated Database type yet; supabase-js's .from() requires a known table-name union, so
  // this is a deliberate escape hatch until app/src/types/database.ts is regenerated from the
  // live schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase.from(table as any);

async function getSupabase() {
  return createSupabaseServerClient();
}

export async function getBrandWithRelations(brandId: string): Promise<BrandWithRelations | null> {
  const supabase = await getSupabase();

  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .single();

  if (brandError || !brand) return null;

  const [{ data: competitors }, { data: prompts }, { data: workspace }] = await Promise.all([
    supabase
      .from("competitors")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: true }),
    supabase
      .from("prompts")
      .select("*")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase.from("workspaces").select("*").eq("id", brand.workspace_id).single(),
  ]);

  return {
    ...brand,
    competitors: competitors ?? [],
    prompts: prompts ?? [],
    workspace: workspace!,
  };
}

export async function getLatestVisibilitySnapshot(
  brandId: string,
  // Not yet consumed: visibility_snapshots (migration 0016) has no per-engine column to filter
  // on today, and nothing calls this function yet. Kept in the signature since sibling query
  // functions in this file all take the same (brandId, engine) shape; wire this up for real if a
  // caller needs it rather than guessing at a filter now.
  engine: "gemini" | "nvidia_nim" = "gemini",
): Promise<VisibilitySnapshotRow | null> {
  void engine;
  const supabase = await getSupabase();

  const { data } = await supabaseFrom(supabase, "visibility_snapshots")
    .select("*")
    .eq("brand_id", brandId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  return data as VisibilitySnapshotRow | null;
}

// Re-exported for the same reason as mapPlanTier above: the pure shaping
// logic lives in explanation-engine.ts (no Supabase import, unit-testable in
// a plain Node process); this wrapper is the one place that actually reads
// the DB.
export { shapeExplanationEngineData };

/**
 * Explanation Engine / Opportunity Finder data for Competitor Explorer's
 * always-present-but-sometimes-locked panel (see
 * progress/modules/5.6-dashboard-frontend.md's acceptance criterion, and
 * ExplanationEngineData's doc-comment in types.ts for the full status
 * model). getLatestVisibilitySnapshot already selects the whole row
 * (explanation_breakdown/opportunity_gaps/recommended_actions included) --
 * this was written for Module 5.5 but never had a caller until now.
 */
export async function getExplanationEngineData(brandId: string): Promise<ExplanationEngineData> {
  const snapshot = await getLatestVisibilitySnapshot(brandId);
  return shapeExplanationEngineData(snapshot);
}

export async function computeOverviewMetrics(
  brandId: string,
  engine: "gemini" | "nvidia-nim",
): Promise<OverviewMetrics> {
  const supabase = await getSupabase();
  // BUG FIX (2026-09-01): this compared against "google_gemini", a string
  // check_runs.provider never actually holds -- the worker always writes
  // the literal "gemini" (task-model.ts's resolvedTaskModelSchema enum is
  // z.enum(["gemini", "nvidia_nim"]); complete_check_job/
  // retry_or_fail_check_job just pass that value straight through, see
  // engine-worker/index.ts). Every .eq("provider", provider) filter using
  // the old value silently matched zero rows for the Gemini engine
  // selection on every dashboard page (Overview, Prompt Explorer,
  // Competitor Explorer, Reports), even for a brand with real completed
  // check_runs -- indistinguishable from "no data" without reading this
  // far into the query. Found while tracing why Trusight2's dashboard
  // showed nothing despite genuine (if rare, given the concurrent Gemini
  // quota exhaustion) successful runs existing in the DB.
  const provider = engine === "gemini" ? "gemini" : "nvidia_nim";

  // These five reads are all independent of one another (none depends on
  // another's result), so they're fetched in parallel rather than as a
  // sequential waterfall -- found 2026-09-02 while diagnosing why every
  // dashboard page took multiple seconds to render: this function alone
  // was doing 4-5 fully sequential round trips to a cross-region database
  // (Supabase in ap-southeast-1, Vercel in iad1), which stacks real network
  // latency instead of overlapping it. brandName is now always fetched
  // (previously only when a snapshot existed) since it's one more parallel
  // query, not an extra sequential one.
  const [
    { data: snapshot },
    { count: competitorCount },
    { count: promptCount },
    { data: lastRun },
    { data: brand },
  ] = await Promise.all([
    supabaseFrom(supabase, "visibility_snapshots")
      .select("score, share_of_voice, mention_count, avg_rank, generated_at")
      .eq("brand_id", brandId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single() as unknown as Promise<{
      data: VisibilitySnapshotRow | null;
      // Only `data` is read below (checked via truthiness); `error` isn't reused, so a precise
      // Postgrest error type isn't worth reproducing here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: any;
    }>,
    supabase
      .from("competitors")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brandId),
    supabase
      .from("prompts")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .eq("is_active", true),
    supabase
      .from("check_runs")
      .select("checked_at")
      .eq("brand_id", brandId)
      .eq("provider", provider)
      .eq("status", "completed")
      .order("checked_at", { ascending: false })
      .limit(1)
      .single(),
    supabase.from("brands").select("name").eq("id", brandId).single(),
  ]);

  if (snapshot) {
    const shareOfVoice = snapshot.share_of_voice as Record<string, number>;
    const brandName = brand?.name ?? "";
    const brandShare = shareOfVoice[brandName] ?? 0;

    // Calculate rank from share_of_voice. share_of_voice is stored as JSONB (the generated Json
    // type); this { competitors: [...] } shape comes from the SQL scoring function in migration
    // 0016 and isn't represented in the generated Json type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const competitors = (shareOfVoice as any).competitors ?? [];
    const higherCompetitors = competitors.filter(
      (c: { share_pct: number }) => c.share_pct > brandShare,
    );
    const rank = higherCompetitors.length + 1;

    return {
      visibilityScore: snapshot.score,
      shareOfVoice: brandShare,
      rank,
      totalCompetitors: competitorCount ?? 0,
      totalPrompts: promptCount ?? 0,
      lastChecked: lastRun?.checked_at ?? snapshot.generated_at,
      engine,
    };
  }

  // No snapshot yet - return zeros
  return {
    visibilityScore: 0,
    shareOfVoice: 0,
    rank: competitorCount ? competitorCount + 1 : 1,
    totalCompetitors: competitorCount ?? 0,
    totalPrompts: promptCount ?? 0,
    lastChecked: lastRun?.checked_at ?? null,
    engine,
  };
}

export async function getPromptExplorerData(
  brandId: string,
  engine: "gemini" | "nvidia-nim" = "gemini",
  // Optional report-period bounds (ISO timestamps). Undefined = unfiltered,
  // which preserves the existing behavior for Prompt Explorer's own caller
  // (no period selector there) -- only getReportData passes these.
  periodStart?: string,
  periodEnd?: string,
): Promise<PromptExplorerRow[]> {
  const supabase = await getSupabase();
  // BUG FIX (2026-09-01): this compared against "google_gemini", a string
  // check_runs.provider never actually holds -- the worker always writes
  // the literal "gemini" (task-model.ts's resolvedTaskModelSchema enum is
  // z.enum(["gemini", "nvidia_nim"]); complete_check_job/
  // retry_or_fail_check_job just pass that value straight through, see
  // engine-worker/index.ts). Every .eq("provider", provider) filter using
  // the old value silently matched zero rows for the Gemini engine
  // selection on every dashboard page (Overview, Prompt Explorer,
  // Competitor Explorer, Reports), even for a brand with real completed
  // check_runs -- indistinguishable from "no data" without reading this
  // far into the query. Found while tracing why Trusight2's dashboard
  // showed nothing despite genuine (if rare, given the concurrent Gemini
  // quota exhaustion) successful runs existing in the DB.
  const provider = engine === "gemini" ? "gemini" : "nvidia_nim";

  let runsQuery = supabase
    .from("check_runs")
    .select(
      `
      id,
      prompt_id,
      checked_at,
      raw_answer,
      model,
      provider,
      check_extractions!check_extractions_check_run_id_fkey(
        brand_mentioned,
        position_among_competitors,
        competitor_names_found,
        cited_domains,
        cited_domain_types
      )
    `,
    )
    .eq("brand_id", brandId)
    .eq("provider", provider)
    .eq("status", "completed");
  if (periodStart) runsQuery = runsQuery.gte("checked_at", periodStart);
  if (periodEnd) runsQuery = runsQuery.lte("checked_at", periodEnd);
  const { data: runs } = await runsQuery.order("checked_at", { ascending: false }).limit(100);

  if (!runs) return [];

  // Get prompts
  const { data: prompts } = await supabase
    .from("prompts")
    .select("id, text")
    .eq("brand_id", brandId)
    .eq("is_active", true);

  const promptMap = new Map(prompts?.map((p) => [p.id, p.text]) ?? []);

  return runs.map((run) => {
    // supabase-js doesn't infer the joined check_extractions relation's shape from the
    // .select() template string above; the real columns are validated by that query string
    // against the live schema at request time.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extraction = (run as any).check_extractions?.[0];
    const brandMentioned = extraction?.brand_mentioned ?? false;
    const brandPosition = extraction?.position_among_competitors ?? null;
    const competitorNames = extraction?.competitor_names_found ?? [];
    const citedDomains = extraction?.cited_domains?.length ?? 0;
    const citedTypes = extraction?.cited_domain_types?.length ?? 0;
    const citationRatio =
      citedDomains > 0 ? Math.min(citedDomains / (citedDomains + citedTypes + 1), 1) : 0;

    // Calculate visibility score for this prompt (simplified)
    const visibilityScore = brandMentioned
      ? Math.round(100 / Math.log2((brandPosition ?? 1) + 1))
      : 0;

    return {
      id: run.id,
      promptText: promptMap.get(run.prompt_id) ?? "Unknown prompt",
      brandMentioned,
      brandPosition,
      competitorMentions: competitorNames,
      visibilityScore,
      citationRatio: Math.round(citationRatio * 100) / 100,
      checkedAt: run.checked_at,
      engine,
      sourceId: run.id,
    };
  });
}

export async function getCompetitorExplorerData(
  brandId: string,
  engine: "gemini" | "nvidia-nim" = "gemini",
  // Same optional report-period bounds as getPromptExplorerData above --
  // undefined = unfiltered (Competitor Explorer's own caller has no period
  // selector), only getReportData passes these.
  periodStart?: string,
  periodEnd?: string,
): Promise<CompetitorExplorerRow[]> {
  const supabase = await getSupabase();
  // BUG FIX (2026-09-01): this compared against "google_gemini", a string
  // check_runs.provider never actually holds -- the worker always writes
  // the literal "gemini" (task-model.ts's resolvedTaskModelSchema enum is
  // z.enum(["gemini", "nvidia_nim"]); complete_check_job/
  // retry_or_fail_check_job just pass that value straight through, see
  // engine-worker/index.ts). Every .eq("provider", provider) filter using
  // the old value silently matched zero rows for the Gemini engine
  // selection on every dashboard page (Overview, Prompt Explorer,
  // Competitor Explorer, Reports), even for a brand with real completed
  // check_runs -- indistinguishable from "no data" without reading this
  // far into the query. Found while tracing why Trusight2's dashboard
  // showed nothing despite genuine (if rare, given the concurrent Gemini
  // quota exhaustion) successful runs existing in the DB.
  const provider = engine === "gemini" ? "gemini" : "nvidia_nim";

  // Get competitors
  const { data: competitors } = await supabase
    .from("competitors")
    .select("*")
    .eq("brand_id", brandId);

  if (!competitors || competitors.length === 0) return [];

  // Get all check_runs and extractions for this brand/provider
  let runsQuery = supabase
    .from("check_runs")
    .select(
      `
      id,
      checked_at,
      check_extractions!check_extractions_check_run_id_fkey(
        competitor_names_found,
        cited_domains
      )
    `,
    )
    .eq("brand_id", brandId)
    .eq("provider", provider)
    .eq("status", "completed");
  if (periodStart) runsQuery = runsQuery.gte("checked_at", periodStart);
  if (periodEnd) runsQuery = runsQuery.lte("checked_at", periodEnd);
  const { data: runs } = await runsQuery;

  if (!runs) return [];

  // Aggregate competitor mentions
  const competitorStats = new Map<
    string,
    {
      mentions: number;
      totalCitations: number;
      totalRuns: number;
      positions: number[];
      lastChecked: string | null;
    }
  >();

  competitors.forEach((c) => {
    competitorStats.set(c.name, {
      mentions: 0,
      totalCitations: 0,
      totalRuns: 0,
      positions: [],
      lastChecked: null,
    });
  });

  runs.forEach((run) => {
    // Same reason as getPromptExplorerData above: the joined check_extractions relation's shape
    // isn't inferred from the .select() template string, only validated by it against the live
    // schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extraction = (run as any).check_extractions?.[0];
    if (!extraction) return;

    const competitorNames = extraction.competitor_names_found ?? [];
    const citedDomains = extraction.cited_domains?.length ?? 0;

    competitorNames.forEach((name: string, idx: number) => {
      const stats = competitorStats.get(name);
      if (stats) {
        stats.mentions += 1;
        stats.totalCitations += citedDomains;
        stats.positions.push(idx + 1);
        if (!stats.lastChecked || run.checked_at > stats.lastChecked) {
          stats.lastChecked = run.checked_at;
        }
      }
    });

    // Also track total runs for citation ratio
    competitors.forEach((c) => {
      const stats = competitorStats.get(c.name);
      if (stats) stats.totalRuns += 1;
    });
  });

  // Calculate total mentions across all competitors for share of voice
  const totalMentions = Array.from(competitorStats.values()).reduce(
    (sum, s) => sum + s.mentions,
    0,
  );

  return competitors.map((c) => {
    const stats = competitorStats.get(c.name)!;
    const shareOfVoice = totalMentions > 0 ? (stats.mentions / totalMentions) * 100 : 0;
    const avgPosition =
      stats.positions.length > 0
        ? stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length
        : 0;
    const citationRatio =
      stats.totalRuns > 0 ? Math.min(stats.totalCitations / stats.totalRuns / 10, 1) : 0;

    return {
      competitorId: c.id,
      competitorName: c.name,
      competitorDomain: null, // not in schema
      mentions: stats.mentions,
      shareOfVoice: Math.round(shareOfVoice * 100) / 100,
      avgPosition: Math.round(avgPosition * 100) / 100,
      citationRatio: Math.round(citationRatio * 100) / 100,
      lastChecked: stats.lastChecked,
      engine,
    };
  });
}

export async function getReportData(
  brandId: string,
  periodStart: string,
  periodEnd: string,
  engine: "gemini" | "nvidia-nim" = "gemini",
): Promise<ReportData | null> {
  const supabase = await getSupabase();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, name")
    .eq("id", brandId)
    .single();
  if (!brand) return null;

  const [overview, prompts, competitors] = await Promise.all([
    computeOverviewMetrics(brandId, engine),
    getPromptExplorerData(brandId, engine, periodStart, periodEnd),
    getCompetitorExplorerData(brandId, engine, periodStart, periodEnd),
  ]);

  return {
    brandId: brand.id,
    brandName: brand.name,
    periodStart,
    periodEnd,
    overview,
    prompts,
    competitors,
    engine,
  };
}

// Re-exported here so existing `@/modules/dashboard/queries` imports keep
// working unchanged; the actual implementation lives in ./plan-tier.ts,
// deliberately isolated from this file's Supabase/Next.js runtime imports so
// it can be unit tested in a plain Node process. See that file's doc-comment.
export { mapPlanTier } from "./plan-tier";

// Re-exported here for the same reason as mapPlanTier above: existing
// `@/modules/dashboard/queries` imports (reports/page.tsx) keep working
// unchanged, but the actual query logic lives in a single place
// (modules/crawl-audit/crawl-audit.ts) instead of being reimplemented here
// via the `table as any` escape hatch — crawl_audits is already in the
// generated Database type, so that escape hatch was never justified for
// this table in the first place.
export { getLatestCrawlAudit } from "@/modules/crawl-audit";

export async function getEmptyStateConfig(brandId: string | null): Promise<EmptyStateConfig> {
  const supabase = await getSupabase();

  let hasBrands = false;
  let hasPrompts = false;
  let hasCompetitors = false;
  let hasSnapshots = false;
  let hasPendingChecks = false;
  let mostRecentPendingErrorCode: string | null = null;
  let planTier: PlanTier = "free";

  if (brandId) {
    const { data: brand } = await supabase
      .from("brands")
      .select("workspace_id")
      .eq("id", brandId)
      .single();

    if (brand) {
      hasBrands = true;

      // check_jobs has RLS enabled with *no* select policy at all (migration
      // 0007: "A job can reveal a customer's prompt cadence, so it is never
      // client-readable.") -- querying it through the normal RLS-scoped
      // `supabase` client silently returns zero rows, no error, for every
      // real user. Found 2026-09-01 while live-verifying this feature: the
      // banner never appeared despite real queued/retry rows existing.
      // Reading it via the service-role client (server-only, never reaches
      // the client bundle) is safe here specifically because we only do so
      // *after* `brand` above was already resolved through the RLS-scoped
      // client -- brands_select_member already proved this brandId belongs
      // to the current user's workspace, so this isn't a new IDOR surface.
      // We still only surface a derived boolean + a coarse error code to
      // callers, never the raw job rows (attempts, source, available_at),
      // respecting the original intent of that migration's RLS choice.
      const serviceRoleSupabase = createSupabaseServiceRoleClient();

      const [
        { count: promptCount },
        { count: competitorCount },
        { data: snapshot },
        { data: workspace },
        { data: pendingJobs },
      ] = await Promise.all([
        supabase
          .from("prompts")
          .select("*", { count: "exact", head: true })
          .eq("brand_id", brandId)
          .eq("is_active", true),
        supabase
          .from("competitors")
          .select("*", { count: "exact", head: true })
          .eq("brand_id", brandId),
        supabaseFrom(supabase, "visibility_snapshots")
          .select("id")
          .eq("brand_id", brandId)
          .limit(1)
          .single(),
        supabase.from("workspaces").select("plan_tier").eq("id", brand.workspace_id).single(),
        // Distinguishes "genuinely untried" from "queued but blocked on a
        // provider retry" for pages that would otherwise show the exact
        // same bare zeros either way. Ordered by created_at so the most
        // *recent* pending job's error wins over an older one if several
        // prompts are all mid-retry at once.
        serviceRoleSupabase
          .from("check_jobs")
          .select("last_error_code, created_at")
          .eq("brand_id", brandId)
          .in("status", ["queued", "processing", "retry"])
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      hasPrompts = (promptCount ?? 0) > 0;
      hasCompetitors = (competitorCount ?? 0) > 0;
      hasSnapshots = !!snapshot;
      hasPendingChecks = (pendingJobs?.length ?? 0) > 0;
      mostRecentPendingErrorCode = pendingJobs?.[0]?.last_error_code ?? null;
      planTier = (workspace?.plan_tier as PlanTier) ?? "free";
    }
  }

  return {
    hasBrands,
    hasPrompts,
    hasCompetitors,
    hasSnapshots,
    hasPendingChecks,
    mostRecentPendingErrorCode,
    planTier,
  };
}
