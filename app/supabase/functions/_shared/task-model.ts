import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Mirrors resolvedTaskModelSchema in src/lib/ai-providers/schemas.ts -- the
// app-side resolveTaskModel() already validated its DB row with zod; this
// copy read the row with a bare `as` cast instead (found during Module 5.3's
// review, 2026-07-24). A misconfigured ai_task_configs row (bad provider
// value, empty model string) should fail loudly here, not get silently
// forwarded to a downstream fetch call with a garbage model name.
const resolvedTaskModelSchema = z.object({
  provider: z.enum(["gemini", "nvidia_nim"]),
  model: z.string().trim().min(1).max(200),
});

const taskModelCache = new Map<
  string,
  { provider: "gemini" | "nvidia_nim"; model: string; expires: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function resolveTaskModel(
  taskKey:
    | "grounded_search"
    | "extraction"
    | "explanation_generation"
    | "prompt_suggestion"
    | "outreach_email_drafting",
  workspaceId: string,
): Promise<{ provider: "gemini" | "nvidia_nim"; model: string }> {
  const cacheKey = `${taskKey}:${workspaceId}`;
  const cached = taskModelCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return { provider: cached.provider, model: cached.model };
  }

  // Query global default + workspace override
  const { data: rows, error } = await supabase
    .from("ai_task_configs")
    .select("provider, model, workspace_id")
    .eq("task_key", taskKey)
    .eq("enabled", true)
    .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);

  if (error) throw new Error(`resolveTaskModel query failed: ${error.message}`);

  const result =
    rows?.find((row) => row.workspace_id === workspaceId) ??
    rows?.find((row) => row.workspace_id === null);

  if (!result) throw new Error(`${taskKey} is not configured`);

  const validated = resolvedTaskModelSchema.safeParse(result);
  if (!validated.success) throw new Error(`${taskKey} has an invalid ai_task_configs row`);
  const { provider, model } = validated.data;

  taskModelCache.set(cacheKey, { provider, model, expires: Date.now() + CACHE_TTL_MS });
  return { provider, model };
}

export function invalidateTaskModelCache(taskKey?: string, workspaceId?: string) {
  if (taskKey && workspaceId) {
    taskModelCache.delete(`${taskKey}:${workspaceId}`);
  } else if (taskKey) {
    for (const key of taskModelCache.keys()) {
      if (key.startsWith(`${taskKey}:`)) taskModelCache.delete(key);
    }
  } else {
    taskModelCache.clear();
  }
}
