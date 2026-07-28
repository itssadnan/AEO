import { createSupabaseServiceRoleClient } from "@/lib/db";
import type {
  KeyHealthRow,
  ProviderQuotaSnapshot,
  ErrorLogEntry,
  ChurnCustomer,
  AiTaskConfigRow,
  ProviderName,
  KeySlot,
  FailoverMode,
} from "./types";

export type {
  KeyHealthRow,
  ProviderQuotaSnapshot,
  ErrorLogEntry,
  ChurnCustomer,
  AiTaskConfigRow,
  ProviderName,
  KeySlot,
  FailoverMode,
} from "./types";

// Known free-tier caps for reference only -- these are NOT enforced by the
// application, they are informational only. The real limits are enforced by
// the provider APIs themselves and can change without notice. We surface them
// here so an admin can roughly gauge "how close are we" without leaving the
// console. Source: Google AI Studio docs (Gemini 1.5 Flash: 1,500 RPM / 1M
// TPM free tier) and NVIDIA NIM docs (varies by model, typically 60 RPM free
// tier). These numbers are deliberately NOT used in any quota-enforcement
// logic -- the worker's key-pool failover is driven by actual 429 responses,
// not by these caps.
const KNOWN_FREE_TIER_CAPS: Record<ProviderName, string> = {
  gemini: "1,500 RPM / 1M TPM (Google AI Studio free tier, approximate)",
  nvidia_nim: "60 RPM typical (NVIDIA NIM free tier, varies by model)",
};

async function getSupabase() {
  return createSupabaseServiceRoleClient();
}

export async function getKeyHealth(): Promise<KeyHealthRow[]> {
  const supabase = await getSupabase();

  // ai_provider_key_health is the source of truth for which keys exist and their
  // health state. It has columns: provider, key_slot, is_dead, dead_at,
  // last_error_code. This table is managed by the worker (Module 5.3) and
  // the admin console (this module) -- no other code writes to it.
  const { data, error } = await supabase
    .from("ai_provider_key_health")
    .select("provider, key_slot, is_dead, dead_at, last_error_code")
    .order("provider", { ascending: true })
    .order("key_slot", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    provider: row.provider as ProviderName,
    keySlot: row.key_slot as KeySlot,
    isDead: row.is_dead,
    deadAt: row.dead_at,
    lastErrorCode: row.last_error_code,
  }));
}

export async function getFailoverModes(): Promise<Record<ProviderName, FailoverMode>> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from("ai_provider_settings")
    .select("provider, failover_mode")
    .in("provider", ["gemini", "nvidia_nim"]);

  if (error) throw error;

  const result: Record<ProviderName, FailoverMode> = {
    gemini: "shared",
    nvidia_nim: "shared",
  };

  for (const row of data ?? []) {
    if (row.provider === "gemini" || row.provider === "nvidia_nim") {
      result[row.provider as ProviderName] = row.failover_mode as FailoverMode;
    }
  }

  return result;
}

export async function getQuotaSnapshot(): Promise<ProviderQuotaSnapshot[]> {
  const supabase = await getSupabase();

  // Query check_runs from the last 24h, grouped by provider and key_slot.
  // key_slot is nullable (historical rows and failures where no key was
  // attempted have null). We bucket null into "unknown".
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("check_runs")
    .select("provider, key_slot, checked_at")
    .gte("checked_at", since24h)
    .order("checked_at", { ascending: false });

  if (error) throw error;

  const providers: ProviderName[] = ["gemini", "nvidia_nim"];
  const keySlots: KeySlot[] = ["primary", "secondary", "tertiary"];

  const result: ProviderQuotaSnapshot[] = [];

  for (const provider of providers) {
    const byKeySlot: ProviderQuotaSnapshot["byKeySlot"] = {
      primary: { last1h: 0, last24h: 0 },
      secondary: { last1h: 0, last24h: 0 },
      tertiary: { last1h: 0, last24h: 0 },
      unknown: { last1h: 0, last24h: 0 },
    };

    for (const row of data ?? []) {
      if (row.provider !== provider) continue;
      const slot = row.key_slot ?? "unknown";
      const bucket = keySlots.includes(slot as KeySlot) ? (slot as KeySlot) : "unknown";
      const checkedAt = new Date(row.checked_at).getTime();
      if (checkedAt >= Date.now() - 60 * 60 * 1000) byKeySlot[bucket].last1h += 1;
      byKeySlot[bucket].last24h += 1;
    }

    result.push({
      provider,
      byKeySlot,
      informationalCapNote: KNOWN_FREE_TIER_CAPS[provider],
    });
  }

  return result;
}

export async function getErrorLog(limit = 100): Promise<ErrorLogEntry[]> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from("engine_error_logs")
    .select("id, provider, key_slot, job_id, error_code, retryable, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    keySlot: row.key_slot as KeySlot | null,
    jobId: row.job_id,
    errorCode: row.error_code,
    retryable: row.retryable,
    createdAt: row.created_at,
  }));
}

export async function getChurnSignal(inactiveDays = 14): Promise<ChurnCustomer[]> {
  const supabase = await getSupabase();

  // Get workspaces with their plan tier and last sign-in time from auth.users
  // We need to join workspaces -> auth.users (via workspace_members or similar)
  // For now, use the workspace's updated_at as a proxy if last_sign_in_at
  // isn't directly available. The spec says "from auth.users" -- we'll use
  // the Supabase admin API pattern via service role.
  const { data: workspaces, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, plan_tier, updated_at")
    .order("updated_at", { ascending: true });

  if (wsError) throw wsError;

  // For each workspace, get the owner's last_sign_in_at from auth.users
  // This requires service role and the admin API. Since we're in a Server
  // Action with service role, we can use supabase.auth.admin.listUsers()
  // but that's heavy. Instead, we'll use a simpler approach: the workspace
  // owner is typically the first member. We'll join workspace_members ->
  // auth.users.
  const workspaceIds = (workspaces ?? []).map((w) => w.id);
  if (workspaceIds.length === 0) return [];

  const { data: members, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id, user_id")
    .in("workspace_id", workspaceIds)
    .eq("role", "owner");

  if (memError) throw memError;

  const userIds = [...new Set((members ?? []).map((m) => m.user_id))];
  if (userIds.length === 0) {
    // Fallback: use workspace updated_at
    return (workspaces ?? []).map((w) => ({
      workspaceId: w.id,
      workspaceName: w.name,
      planTier: w.plan_tier,
      lastSignInAt: null,
      daysSinceLastSignIn: null,
    }));
  }

  // Use service role to fetch user metadata including last_sign_in_at
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) throw userError;

  const userMap = new Map(
    (users.users ?? []).filter((u) => userIds.includes(u.id)).map((u) => [
      u.id,
      u.last_sign_in_at,
    ])
  );

  const now = Date.now();
  return (workspaces ?? []).map((w) => {
    const member = (members ?? []).find((m) => m.workspace_id === w.id);
    const lastSignInAt = member ? userMap.get(member.user_id) ?? null : null;
    const daysSinceLastSignIn = lastSignInAt
      ? Math.floor((now - new Date(lastSignInAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      workspaceId: w.id,
      workspaceName: w.name,
      planTier: w.plan_tier,
      lastSignInAt,
      daysSinceLastSignIn,
    };
  }).filter((c) => c.daysSinceLastSignIn === null || c.daysSinceLastSignIn >= inactiveDays);
}

export async function getAiTaskConfigs(): Promise<AiTaskConfigRow[]> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from("ai_task_configs")
    .select("id, task_key, workspace_id, provider, model, enabled, updated_at, updated_by")
    .order("task_key", { ascending: true })
    .order("workspace_id", { ascending: true, nullsFirst: true });

  if (error) throw error;

  // Join workspace names for override rows
  const workspaceIds = [
    ...new Set((data ?? []).filter((r) => r.workspace_id).map((r) => r.workspace_id!)),
  ];
  let workspaceMap = new Map<string, string>();
  if (workspaceIds.length > 0) {
    const { data: wsData } = await supabase
      .from("workspaces")
      .select("id, name")
      .in("id", workspaceIds);
    workspaceMap = new Map((wsData ?? []).map((w) => [w.id, w.name]));
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    taskKey: row.task_key,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_id ? workspaceMap.get(row.workspace_id) ?? null : null,
    provider: row.provider as ProviderName,
    model: row.model,
    enabled: row.enabled,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

export async function upsertAiTaskConfig(input: {
  taskKey: string;
  workspaceId: string | null; // null = global default
  provider: ProviderName;
  model: string;
  enabled: boolean;
}): Promise<AiTaskConfigRow> {
  const supabase = await getSupabase();

  // Validate provider
  if (!["gemini", "nvidia_nim"].includes(input.provider)) {
    throw new Error("Invalid provider");
  }

  // Validate taskKey against known keys (from CONVENTIONS.md Section 5)
  const knownTaskKeys = [
    "grounded_search",
    "extraction",
    "explanation_generation",
    "prompt_suggestion",
    "outreach_email_drafting",
  ];
  if (!knownTaskKeys.includes(input.taskKey)) {
    throw new Error("Invalid taskKey");
  }

  // Get current user (service role context, but we can get the acting admin's
  // user ID from the auth context if available)
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("ai_task_configs")
    .upsert({
      task_key: input.taskKey,
      workspace_id: input.workspaceId,
      provider: input.provider,
      model: input.model,
      enabled: input.enabled,
      updated_by: user?.id ?? null,
    }, { onConflict: "task_key,workspace_id" })
    .select("id, task_key, workspace_id, provider, model, enabled, updated_at, updated_by")
    .single();

  if (error) throw error;

  let workspaceName: string | null = null;
  if (data.workspace_id) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", data.workspace_id)
      .single();
    workspaceName = ws?.name ?? null;
  }

  return {
    id: data.id,
    taskKey: data.task_key,
    workspaceId: data.workspace_id,
    workspaceName,
    provider: data.provider as ProviderName,
    model: data.model,
    enabled: data.enabled,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
}

export function isNearCap(count: number, cap: number | null): boolean {
  if (cap === null) return false;
  return count >= Math.ceil(cap * 0.8);
}
