import {
  AiProviderError,
  type FailoverMode,
  type KeySlot,
  type ProviderName,
  withKeyFailover,
} from "./key-pool.ts";
import { nvidiaChatCompletionSchema } from "./schemas.ts";

export async function runNvidiaNimPrompt(options: {
  prompt: string;
  model: string;
  failoverMode: FailoverMode;
  knownDeadSlots?: ReadonlySet<KeySlot>;
  onKeyDead?: (provider: ProviderName, slot: KeySlot, code: string) => Promise<void>;
  onAttempt?: (slot: KeySlot) => void;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  return withKeyFailover({
    provider: "nvidia_nim",
    mode: options.failoverMode,
    knownDeadSlots: options.knownDeadSlots,
    onKeyDead: options.onKeyDead,
    onAttempt: options.onAttempt,
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
        if (error instanceof DOMException && error.name === "TimeoutError")
          throw new AiProviderError("timeout");
        // A thrown fetch (as opposed to a resolved Response with a bad
        // status) means the request never reached/returned from NVIDIA at
        // all -- DNS failure, connection reset, TLS error, etc. Surface the
        // real exception's name/message as detail so this doesn't collapse
        // into the same opaque "provider_unavailable" as an actual 5xx.
        const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        throw new AiProviderError(
          "provider_unavailable",
          undefined,
          `fetch_failed: ${reason}`.slice(0, 300),
        );
      }
      if (response.status === 429) throw new AiProviderError("rate_limited");
      if (response.status === 401 || response.status === 403)
        throw new AiProviderError("unauthorized");
      if (response.status >= 500) {
        const bodyText = await response.text().catch(() => "");
        throw new AiProviderError(
          "provider_unavailable",
          undefined,
          `http_${response.status}: ${bodyText}`.slice(0, 300),
        );
      }
      if (!response.ok) {
        // Anything else non-ok (most commonly a 400 -- bad model name,
        // malformed body, unsupported param) was previously
        // indistinguishable from a real outage. Capture the body NVIDIA
        // sent back so a misconfigured model/request is diagnosable from
        // check_jobs.last_error_code alone.
        const bodyText = await response.text().catch(() => "");
        throw new AiProviderError(
          "provider_unavailable",
          undefined,
          `http_${response.status}: ${bodyText}`.slice(0, 300),
        );
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiProviderError("malformed_response");
      }
      // Validated with zod (docs/CONVENTIONS.md Definition of Done: all
      // external/AI-model JSON output validated before use), not just a
      // manual `typeof` narrow.
      const validated = nvidiaChatCompletionSchema.safeParse(payload);
      if (!validated.success) throw new AiProviderError("malformed_response");
      return validated.data.choices[0].message.content;
    },
  });
}
