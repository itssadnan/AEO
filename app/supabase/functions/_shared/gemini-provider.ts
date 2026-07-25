import {
  AiProviderError,
  type FailoverMode,
  type KeySlot,
  type ProviderName,
  withKeyFailover,
} from "./key-pool.ts";
import { acquireGeminiToken } from "./rate-limiter.ts";
import { groundedResponseSchema, type GroundedResponse } from "./schemas.ts";

export type { GroundedResponse };

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: Record<string, unknown>;
  }>;
};

function retryAfterSeconds(response: Response): number {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? Math.min(value, 3600) : 60;
}

export async function runGeminiGroundedPrompt(options: {
  prompt: string;
  model: string;
  failoverMode: FailoverMode;
  knownDeadSlots?: ReadonlySet<KeySlot>;
  onKeyDead?: (provider: ProviderName, slot: KeySlot, code: string) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<GroundedResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  return withKeyFailover({
    provider: "gemini",
    mode: options.failoverMode,
    knownDeadSlots: options.knownDeadSlots,
    onKeyDead: options.onKeyDead,
    run: async (key, slot) => {
      // Acquire rate limit token before making the request. Keyed to the
      // specific slot in use, so 3 keys genuinely give ~3x the free-tier
      // throughput instead of sharing one 15rpm/1500rpd bucket between them.
      await acquireGeminiToken(slot);

      let response: Response;
      try {
        response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(45_000),
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: options.prompt }] }],
              tools: [{ google_search: {} }],
            }),
          },
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "TimeoutError")
          throw new AiProviderError("timeout");
        throw new AiProviderError("provider_unavailable");
      }
      if (response.status === 429)
        throw new AiProviderError("rate_limited", retryAfterSeconds(response));
      if (response.status === 401 || response.status === 403)
        throw new AiProviderError("unauthorized");
      if (response.status >= 500) throw new AiProviderError("provider_unavailable");
      if (!response.ok) throw new AiProviderError("provider_unavailable");
      let payload: GeminiResponse;
      try {
        payload = (await response.json()) as GeminiResponse;
      } catch {
        throw new AiProviderError("malformed_response");
      }
      const candidate = payload.candidates?.[0];
      const text = candidate?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();
      const metadata = candidate?.groundingMetadata ?? {};
      const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
      const citations = chunks.flatMap((chunk) => {
        if (typeof chunk !== "object" || chunk === null) return [];
        const web = (chunk as { web?: unknown }).web;
        if (typeof web !== "object" || web === null) return [];
        const uri = (web as { uri?: unknown }).uri;
        const title = (web as { title?: unknown }).title;
        return typeof uri === "string"
          ? [{ uri, ...(typeof title === "string" ? { title } : {}) }]
          : [];
      });
      // Validated with zod, not just manual narrowing -- this is untrusted
      // third-party API output (docs/CONVENTIONS.md Definition of Done:
      // "All external input ... validated with a zod schema before use").
      // The manual extraction above still runs first because Gemini's raw
      // shape is looser than what we want to store (e.g. citations without
      // a uri get silently dropped, not rejected); the schema is the final
      // gate on the shape we're about to hand back to the caller.
      const validated = groundedResponseSchema.safeParse({
        text,
        citations,
        groundingMetadata: metadata,
      });
      if (!validated.success) throw new AiProviderError("malformed_response");
      return validated.data;
    },
  });
}
