import { AiProviderError } from "@/lib/ai-providers/errors";
import { extractionResultSchema, type ExtractionResult } from "./schemas";

export function parseExtractionResponse(rawModelText: string): ExtractionResult {
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
  const validated = extractionResultSchema.safeParse(parsed);
  if (!validated.success) throw new AiProviderError("malformed_response");
  return validated.data;
}
