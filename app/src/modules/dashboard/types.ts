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
