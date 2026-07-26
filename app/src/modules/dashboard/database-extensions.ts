/**
 * Local type extensions for tables added by migrations that haven't been
 * regenerated in the main database.ts yet. These mirror the schema from
 * migrations 0016 and 0017.
 */

import type { Json } from "@/types/database";

export interface VisibilitySnapshotRow {
  id: string;
  brand_id: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  score: number;
  mention_count: number;
  avg_rank: number | null;
  share_of_voice: Json;
  source_influence: Json;
  explanation_breakdown: Json | null;
  opportunity_gaps: Json;
  recommended_actions: Json | null;
  explanation_skip_reason: string | null;
  status: string;
  attempts: number;
  claimed_at: string | null;
  last_error_code: string | null;
  explanation_provider: string | null;
  explanation_model: string | null;
  explanation_completed_at: string | null;
  generated_at: string;
}

export interface BrandSubscriptionRow {
  id: string;
  brand_id: string;
  workspace_id: string;
  plan_tier: string;
  razorpay_subscription_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}
