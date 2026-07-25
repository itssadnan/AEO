import "server-only";
import {
  AiProviderError,
  type FailoverMode,
  type KeySlot,
  type ProviderName,
  withKeyFailover,
} from "./key-pool.ts";
import { nvidiaChatCompletionSchema } from "./schemas.ts";

/**
 * Shared NVIDIA NIM adapter for Modules 5.4 and 5.5. It is intentionally
 * provider-level (rather than an extraction-specific helper), keeping every
 * future NIM task on the same credential-pool/failover path.
 *
 * Built ahead of schedule during Module 5.3's implementation, whose own
 * acceptance criteria scoped it to "GeminiProvider is the only
 * implementation for now" with NVIDIA NIM reserved for 5.4 -- see
 * progress/modules/5.3-engine-query-engine.md's decisions log. Left in
 * place (deleting working, tested code to match a scope line would be
 * pure churn) but not wired into anything 5.3 actually calls; 5.4 should
 * pick this file up rather than rewriting it.
 */
export async function runNvidiaNimPrompt(options: {
  prompt: string;
  model: string;
  failoverMode: FailoverMode;
  knownDeadSlots?: ReadonlySet<KeySlot>;
  onKeyDead?: (provider: ProviderName, slot: KeySlot, code: string) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  return withKeyFailover({
    provider: "nvidia_nim",
    mode: options.failoverMode,
    knownDeadSlots: options.knownDeadSlots,
    onKeyDead: options.onKeyDead,
    run: async (key) => {
      let response: Response;
      try {
        response = await fetchImpl("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(45_000),
          body: JSON.stringify({
            model: options.model,
            messages: [{ role: "user", content: options.prompt }],
            temperature: 0,
          }),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "TimeoutError") {
          throw new AiProviderError("timeout");
        }
        throw new AiProviderError("provider_unavailable");
      }
      if (response.status === 429) throw new AiProviderError("rate_limited");
      if (response.status === 401 || response.status === 403) {
        throw new AiProviderError("unauthorized");
      }
      if (response.status >= 500) throw new AiProviderError("provider_unavailable");
      if (!response.ok) throw new AiProviderError("provider_unavailable");
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiProviderError("malformed_response");
      }
      const validated = nvidiaChatCompletionSchema.safeParse(payload);
      if (!validated.success) throw new AiProviderError("malformed_response");
      return validated.data.choices[0].message.content;
    },
  });
}
