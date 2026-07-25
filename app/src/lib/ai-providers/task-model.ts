import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/db";
import {
  aiTaskKeySchema,
  resolvedTaskModelSchema,
  type AiTaskKey,
  type ResolvedTaskModel,
} from "./schemas.ts";

const cache = new Map<string, { expiresAt: number; value: ResolvedTaskModel }>();
const TTL_MS = 60_000;

export async function resolveTaskModel(
  taskKey: AiTaskKey,
  workspaceId?: string,
): Promise<ResolvedTaskModel> {
  aiTaskKeySchema.parse(taskKey);
  const cacheKey = `${workspaceId ?? "global"}:${taskKey}`;
  const existing = cache.get(cacheKey);
  if (existing && existing.expiresAt > Date.now()) return existing.value;
  const db = createSupabaseServiceRoleClient();
  const { data, error } = await db
    .from("ai_task_configs")
    .select("provider, model, workspace_id, enabled")
    .eq("task_key", taskKey)
    .eq("enabled", true)
    .or(
      workspaceId ? `workspace_id.eq.${workspaceId},workspace_id.is.null` : "workspace_id.is.null",
    );
  if (error) throw new Error("Unable to resolve AI task model");
  const row =
    (data ?? []).find((item) => item.workspace_id === workspaceId) ??
    (data ?? []).find((item) => item.workspace_id === null);
  const parsed = resolvedTaskModelSchema.safeParse(row);
  if (!parsed.success) throw new Error(`No enabled model configured for ${taskKey}`);
  cache.set(cacheKey, { value: parsed.data, expiresAt: Date.now() + TTL_MS });
  return parsed.data;
}
export function invalidateTaskModelCache() {
  cache.clear();
}
