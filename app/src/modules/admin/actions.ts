"use server";

import { requireAdmin } from "@/lib/security";
import type { PlanTierId } from "@/modules/billing";
import {
  getKeyHealth,
  getFailoverModes,
  getQuotaSnapshot,
  getErrorLog,
  getChurnSignal,
  getAiTaskConfigs,
  upsertAiTaskConfig,
  getWorkspacesForOverride,
  setWorkspacePlanTier,
  type KeyHealthRow,
  type ProviderQuotaSnapshot,
  type ErrorLogEntry,
  type ChurnCustomer,
  type AiTaskConfigRow,
  type ProviderName,
  type KeySlot,
  type FailoverMode,
  type WorkspaceOverrideRow,
} from "./queries";

const VALID_PLAN_TIERS: PlanTierId[] = ["free", "starter", "growth", "agency"];

export async function getKeyHealthAction(): Promise<KeyHealthRow[]> {
  const auth = await requireAdmin();
  if (auth) throw new Error(auth.error);
  return getKeyHealth();
}

export async function getFailoverModesAction(): Promise<Record<ProviderName, FailoverMode>> {
  const auth = await requireAdmin();
  if (auth) throw new Error(auth.error);
  return getFailoverModes();
}

export async function getQuotaSnapshotAction(): Promise<ProviderQuotaSnapshot[]> {
  const auth = await requireAdmin();
  if (auth) throw new Error(auth.error);
  return getQuotaSnapshot();
}

export async function getErrorLogAction(limit = 100): Promise<ErrorLogEntry[]> {
  const auth = await requireAdmin();
  if (auth) throw new Error(auth.error);
  return getErrorLog(limit);
}

export async function getChurnSignalAction(inactiveDays = 14): Promise<ChurnCustomer[]> {
  const auth = await requireAdmin();
  if (auth) throw new Error(auth.error);
  return getChurnSignal(inactiveDays);
}

export async function getAiTaskConfigsAction(): Promise<AiTaskConfigRow[]> {
  const auth = await requireAdmin();
  if (auth) throw new Error(auth.error);
  return getAiTaskConfigs();
}

export async function upsertAiTaskConfigAction(input: {
  taskKey: string;
  workspaceId: string | null;
  provider: ProviderName;
  model: string;
  enabled: boolean;
}): Promise<AiTaskConfigRow> {
  const auth = await requireAdmin();
  if (auth) throw new Error(auth.error);

  // Resolve the calling admin's own id from the session-scoped client
  // (requireAdmin() already proved this session belongs to an admin) --
  // NOT from the service-role client the actual write uses, which has no
  // session and would always resolve to null. See queries.ts's
  // upsertAiTaskConfig for the full explanation of why this split exists.
  const { createSupabaseServerClient } = await import("@/lib/db");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return upsertAiTaskConfig({ ...input, updatedBy: user?.id ?? null });
}

export async function clearDeadKeyAction(
  provider: ProviderName,
  slot: KeySlot,
): Promise<{ error: string } | { ok: true }> {
  const auth = await requireAdmin();
  if (auth) return auth;

  const { createSupabaseServiceRoleClient } = await import("@/lib/db");
  const supabase = createSupabaseServiceRoleClient();

  if (!["gemini", "nvidia_nim"].includes(provider)) {
    return { error: "Invalid provider" };
  }
  if (!["primary", "secondary", "tertiary"].includes(slot)) {
    return { error: "Invalid keySlot" };
  }

  const { error } = await supabase
    .from("ai_provider_key_health")
    .update({ is_dead: false, dead_at: null, last_error_code: null })
    .eq("provider", provider)
    .eq("key_slot", slot);

  if (error) return { error: error.message };
  return { ok: true };
}

export async function setFailoverModeAction(
  provider: ProviderName,
  mode: FailoverMode,
): Promise<{ error: string } | { ok: true }> {
  const auth = await requireAdmin();
  if (auth) return auth;

  const { createSupabaseServiceRoleClient } = await import("@/lib/db");
  const supabase = createSupabaseServiceRoleClient();

  if (!["gemini", "nvidia_nim"].includes(provider)) {
    return { error: "Invalid provider" };
  }
  if (!["shared", "emergency-only"].includes(mode)) {
    return { error: "Invalid failover mode" };
  }

  const { error } = await supabase
    .from("ai_provider_settings")
    .update({ failover_mode: mode })
    .eq("provider", provider);

  if (error) return { error: error.message };
  return { ok: true };
}

export async function getWorkspacesForOverrideAction(): Promise<WorkspaceOverrideRow[]> {
  const auth = await requireAdmin();
  if (auth) throw new Error(auth.error);
  return getWorkspacesForOverride();
}

/**
 * Admin-only testing override: force a workspace's plan tier without a real
 * Razorpay payment. Lets the site admin verify every paid-tier feature
 * (competitor tracking, custom prompts, reports, on-demand checks) works end
 * to end while Razorpay stays unconfigured/on hold. See
 * progress/modules/5.9-billing-and-subscription.md decisions log, 2026-08-14.
 */
export async function setWorkspacePlanTierAction(
  workspaceId: string,
  planTier: PlanTierId,
): Promise<{ error: string } | { ok: true }> {
  const auth = await requireAdmin();
  if (auth) return auth;

  if (!workspaceId) return { error: "Missing workspaceId" };
  if (!VALID_PLAN_TIERS.includes(planTier)) return { error: "Invalid plan tier" };

  return setWorkspacePlanTier(workspaceId, planTier);
}

export interface CheckStatusResult {
  status: "queued" | "processing" | "retry" | "completed" | "failed";
  lastErrorCode: string | null;
  /**
   * ISO timestamp of the job's next eligible attempt. Only meaningful when
   * status is "retry" (a rate-limited/errored attempt that will be retried
   * automatically by the background worker) -- lets the UI show a real ETA
   * instead of the misleading "picking this up any second" framing that
   * made a retry backoff of up to an hour (see retry_or_fail_check_job's
   * 3600s clamp, migration 0007) look like a hang.
   */
  availableAt: string | null;
  run: {
    status: "success" | "error" | "rate_limited";
    rawAnswer: string | null;
    citations: unknown;
    provider: string;
    model: string;
  } | null;
}

/**
 * Admin-only: queue a check for any workspace/brand/prompt regardless of
 * plan tier, bypassing enqueue_free_check()'s free-tier-only restriction
 * (paid workspaces normally only get scheduled checks). Mirrors that RPC's
 * own validation and dedup behavior at the application layer instead of
 * modifying the customer-facing RPC. See migration 0024 for the
 * 'admin_manual' source value this relies on, and
 * progress/modules/5.9-billing-and-subscription.md decisions log,
 * 2026-08-14 entry, for the full context.
 */
export async function adminEnqueueCheckAction(
  workspaceId: string,
  brandId: string,
  promptId: string,
): Promise<{ jobId: string } | { error: string }> {
  const auth = await requireAdmin();
  if (auth) return auth;

  const { createSupabaseServiceRoleClient } = await import("@/lib/db");
  const supabase = createSupabaseServiceRoleClient();

  const { data: prompt, error: promptError } = await supabase
    .from("prompts")
    .select("id, is_active, brand_id, brands!inner(id, workspace_id)")
    .eq("id", promptId)
    .eq("brand_id", brandId)
    .maybeSingle();

  if (promptError) return { error: promptError.message };
  if (!prompt || !prompt.is_active) return { error: "Prompt not found or inactive." };
  const brand = Array.isArray(prompt.brands) ? prompt.brands[0] : prompt.brands;
  if (!brand || brand.workspace_id !== workspaceId) {
    return { error: "Prompt does not belong to that workspace/brand." };
  }

  const { data, error } = await supabase
    .from("check_jobs")
    .insert({
      workspace_id: workspaceId,
      brand_id: brandId,
      prompt_id: promptId,
      source: "admin_manual",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "This prompt already has a check waiting to run." };
    return { error: error.message };
  }
  return { jobId: data.id };
}

export async function getCheckStatusAction(
  jobId: string,
): Promise<CheckStatusResult | { error: string }> {
  const auth = await requireAdmin();
  if (auth) return auth;

  const { createSupabaseServiceRoleClient } = await import("@/lib/db");
  const supabase = createSupabaseServiceRoleClient();

  const { data: job, error: jobError } = await supabase
    .from("check_jobs")
    .select("status, last_error_code, prompt_id, created_at, available_at")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) return { error: jobError.message };
  if (!job) return { error: "Job not found." };

  // BUG FIX (2026-09-01): this used to only fetch the check_runs row when
  // status was "completed"/"failed". retry_or_fail_check_job (migration
  // 0007) inserts a check_runs row -- including a rate_limited one -- on
  // EVERY failed attempt, whether or not the job still has retries left, so
  // a job sitting in "retry" (which can be for up to an hour per attempt,
  // clamped in that same function) already has a real, informative run row
  // the whole time. Excluding "retry" here meant the admin-only "run check
  // now" panel showed nothing but a bare "Job status: retry (rate_limited)"
  // line for the entire backoff window instead of the friendly
  // "this is a live quota limit, not a bug" explanation and the actual
  // provider response -- looked identical to a hang.
  let run: CheckStatusResult["run"] = null;
  if (job.status === "completed" || job.status === "failed" || job.status === "retry") {
    const { data: runRow } = await supabase
      .from("check_runs")
      .select("status, raw_answer, citations, provider, model")
      .eq("prompt_id", job.prompt_id)
      .gte("checked_at", job.created_at)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (runRow) {
      run = {
        status: runRow.status as "success" | "error" | "rate_limited",
        rawAnswer: runRow.raw_answer,
        citations: runRow.citations,
        provider: runRow.provider,
        model: runRow.model,
      };
    }
  }

  return {
    status: job.status as CheckStatusResult["status"],
    lastErrorCode: job.last_error_code,
    availableAt: job.available_at,
    run,
  };
}

export async function deleteWorkspaceOverrideAction(
  taskKey: string,
  workspaceId: string,
): Promise<{ error: string } | { ok: true }> {
  const auth = await requireAdmin();
  if (auth) return auth;

  const { createSupabaseServiceRoleClient } = await import("@/lib/db");
  const supabase = createSupabaseServiceRoleClient();

  const knownTaskKeys = [
    "grounded_search",
    "extraction",
    "explanation_generation",
    "prompt_suggestion",
    "outreach_email_drafting",
  ];
  if (!knownTaskKeys.includes(taskKey)) {
    return { error: "Invalid taskKey" };
  }
  if (!workspaceId) {
    return { error: "Cannot delete global default row" };
  }

  const { error } = await supabase
    .from("ai_task_configs")
    .delete()
    .eq("task_key", taskKey)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };
  return { ok: true };
}
