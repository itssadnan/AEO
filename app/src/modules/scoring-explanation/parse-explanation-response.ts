import { AiProviderError } from "@/lib/ai-providers/errors";
import { explanationResultSchema, type ExplanationResult } from "./schemas";

/**
 * Parses the raw NVIDIA NIM response for the explanation engine.
 * Validates against explanationResultSchema (zod) and strips markdown code fences.
 * Throws AiProviderError("malformed_response") on any validation failure.
 */
export function parseExplanationResponse(rawModelText: string): ExplanationResult {
  const stripped = rawModelText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new AiProviderError("malformed_response");
  }

  const validated = explanationResultSchema.safeParse(parsed);
  if (!validated.success) throw new AiProviderError("malformed_response");

  return validated.data;
}
