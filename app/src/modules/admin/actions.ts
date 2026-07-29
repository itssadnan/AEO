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
  slot: KeySlot
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
  mode: FailoverMode
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

export async function deleteWorkspaceOverrideAction(
  taskKey: string,
  workspaceId: string
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
