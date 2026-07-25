import { AiProviderError } from "@/lib/ai-providers/errors";
import { extractionResultSchema, type ExtractionResult } from "./schemas";

export function parseExtractionResponse(rawModelText: string, rawAnswer: string): ExtractionResult {
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

  const result = validated.data;
  // Mechanical grounding check: if the model claims the brand was mentioned, its
  // own quoted evidence must actually appear in the real answer text -- not just
  // be present as a field (the schema already checked that), but be REAL. A model
  // that hallucinates brand_mentioned: true with a fabricated or empty quote is
  // caught here and the job is treated as a malformed response (goes to
  // retry/fail), rather than writing an unverified result to the database.
  if (result.brand_mentioned) {
    const evidence = result.brand_mention_evidence?.trim().toLowerCase() ?? "";
    if (!evidence || !rawAnswer.toLowerCase().includes(evidence)) {
      throw new AiProviderError("malformed_response");
    }
  }

  return result;
}
