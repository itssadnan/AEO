import type { Database } from "@/types/database";
import type { VisibilitySnapshotRow } from "./database-extensions";

export type Brand = Database["public"]["Tables"]["brands"]["Row"];
export type Competitor = Database["public"]["Tables"]["competitors"]["Row"];
export type Prompt = Database["public"]["Tables"]["prompts"]["Row"];
export type VisibilitySnapshot = VisibilitySnapshotRow;
export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
export type CheckExtraction = Database["public"]["Tables"]["check_extractions"]["Row"];
export type CheckRun = Database["public"]["Tables"]["check_runs"]["Row"];

export type PlanTier = "free" | "starter" | "growth" | "agency";

export interface BrandWithRelations extends Brand {
  competitors: Competitor[];
  prompts: Prompt[];
  workspace: Workspace;
}

export interface PromptWithSnapshots extends Prompt {
  check_runs: CheckRun[];
}

export interface OverviewMetrics {
  visibilityScore: number;
  shareOfVoice: number;
  rank: number;
  totalCompetitors: number;
  totalPrompts: number;
  lastChecked: string | null;
  engine: "gemini" | "nvidia-nim";
  mentionCount?: number;
}

export interface PromptExplorerRow {
  id: string;
  promptText: string;
  brandMentioned: boolean;
  brandPosition: number | null;
  competitorMentions: string[];
  visibilityScore: number;
  citationRatio: number;
  checkedAt: string;
  engine: "gemini" | "nvidia-nim";
  sourceId: string;
}

export interface CompetitorExplorerRow {
  competitorId: string;
  competitorName: string;
  competitorDomain: string | null;
  mentions: number;
  shareOfVoice: number;
  avgPosition: number;
  citationRatio: number;
  lastChecked: string | null;
  engine: "gemini" | "nvidia-nim";
}

export interface ReportData {
  brandId: string;
  brandName: string;
  periodStart: string;
  periodEnd: string;
  overview: OverviewMetrics;
  prompts: PromptExplorerRow[];
  competitors: CompetitorExplorerRow[];
  engine: "gemini" | "nvidia-nim";
}

export interface EmptyStateConfig {
  hasBrands: boolean;
  hasPrompts: boolean;
  hasCompetitors: boolean;
  hasSnapshots: boolean;
  planTier: PlanTier;
}

/**
 * Explanation Engine / Opportunity Finder (Module 5.5's backend, surfaced in
 * the UI here for the first time — see progress/modules/5.6-dashboard-
 * frontend.md's acceptance criterion: "Share-of-Voice always shown;
 * Explanation Engine + Opportunity Finder panels render as a visible
 * locked/upsell state for Free-plan workspaces (never silently omitted),
 * full panels for paid").
 *
 * `status` collapses visibility_snapshots.status + explanation_skip_reason
 * into one field the view can switch on directly:
 * - "no_data": no snapshot exists yet for this brand (no check has completed).
 * - "free_plan": real, DB-enforced gate (run_visibility_scoring_cycle sets
 *   explanation_skip_reason='free_plan') -- unlike the fictional per-page
 *   "Pro" locks removed elsewhere in this module, this one has actual
 *   backing: Free-plan rows never even queue the NVIDIA NIM call.
 * - "no_competitor_ahead": paid plan, but no competitor currently beats this
 *   brand's mention count -- there is genuinely nothing to explain.
 * - "pending": paid plan, a competitor is ahead, the numeric breakdown/gaps
 *   below are already computed (pure SQL, synchronous), but the NVIDIA NIM
 *   prose (explanationText/recommendedActions) hasn't completed yet.
 * - "completed": everything below is populated.
 * - "failed": the explanation worker exhausted its 5 attempts; numeric data
 *   is still shown, prose never arrived.
 */
export type ExplanationEngineStatus =
  "no_data" | "free_plan" | "no_competitor_ahead" | "pending" | "completed" | "failed";

export interface CitationProfileEntry {
  domainType: string;
  pct: number;
}

export interface OpportunityGap {
  domainType: string;
  competitorCitationCount: number;
  competitorPct: number;
  brandCitationCount: number;
}

export interface RecommendedAction {
  action: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
}

export interface ExplanationEngineData {
  status: ExplanationEngineStatus;
  competitorName: string | null;
  brandMentionCount: number | null;
  competitorMentionCount: number | null;
  /** Precomputed by SQL, rounded to 1 decimal -- see prompt.ts's doc-comment. */
  citationRatio: number | null;
  /** The brand's own citation-type mix (source_influence -- always computed, every plan tier). */
  brandCitationProfile: CitationProfileEntry[];
  /** The leading competitor's citation-type mix (explanation_breakdown.breakdown -- paid only). */
  competitorCitationProfile: CitationProfileEntry[];
  opportunityGaps: OpportunityGap[];
  explanationText: string | null;
  recommendedActions: RecommendedAction[];
  attempts: number;
  lastErrorCode: string | null;
  explanationProvider: string | null;
  explanationModel: string | null;
  generatedAt: string | null;
}
