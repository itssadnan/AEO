"use server";

import { requireAdmin } from "@/lib/security";
import {
  getKeyHealth,
  getFailoverModes,
  getQuotaSnapshot,
  getErrorLog,
  getChurnSignal,
  getAiTaskConfigs,
  upsertAiTaskConfig,
  type KeyHealthRow,
  type ProviderQuotaSnapshot,
  type ErrorLogEntry,
  type ChurnCustomer,
  type AiTaskConfigRow,
  type ProviderName,
  type KeySlot,
  type FailoverMode,
} from "./queries";

export async function getKeyHealthAction(): Promise<KeyHealthRow[]> {
  await requireAdmin();
  return getKeyHealth();
}

export async function getFailoverModesAction(): Promise<Record<ProviderName, FailoverMode>> {
  await requireAdmin();
  return getFailoverModes();
}

export async function getQuotaSnapshotAction(): Promise<ProviderQuotaSnapshot[]> {
  await requireAdmin();
  return getQuotaSnapshot();
}

export async function getErrorLogAction(limit = 100): Promise<ErrorLogEntry[]> {
  await requireAdmin();
  return getErrorLog(limit);
}

export async function getChurnSignalAction(inactiveDays = 14): Promise<ChurnCustomer[]> {
  await requireAdmin();
  return getChurnSignal(inactiveDays);
}

export async function getAiTaskConfigsAction(): Promise<AiTaskConfigRow[]> {
  await requireAdmin();
  return getAiTaskConfigs();
}

export async function upsertAiTaskConfigAction(input: {
  taskKey: string;
  workspaceId: string | null;
  provider: ProviderName;
  model: string;
  enabled: boolean;
}): Promise<AiTaskConfigRow> {
  await requireAdmin();
  return upsertAiTaskConfig(input);
}

export async function clearDeadKeyAction(provider: ProviderName, slot: KeySlot): Promise<{ error: string } | { ok: true }> {
  await requireAdmin();

  const { createSupabaseServiceRoleClient } = await import("@/lib/db");
  const supabase = createSupabaseServiceRoleClient();

  // Validate inputs
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

export async function setFailoverModeAction(provider: ProviderName, mode: FailoverMode): Promise<{ error: string } | { ok: true }> {
  await requireAdmin();

  const { createSupabaseServiceRoleClient } = await import("@/lib/db");
  const supabase = createSupabaseServiceRoleClient();

  // Validate inputs
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

export async function deleteWorkspaceOverrideAction(taskKey: string, workspaceId: string): Promise<{ error: string } | { ok: true }> {
  await requireAdmin();

  const { createSupabaseServiceRoleClient } = await import("@/lib/db");
  const supabase = createSupabaseServiceRoleClient();

  // Validate inputs
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
