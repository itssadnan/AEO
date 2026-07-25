// Deno-side twin of src/lib/ai-providers/schemas.ts -- see the duplication
// note in key-pool.ts for why this can't just be imported from the app.
// zod is fetched from esm.sh since Deno Edge Functions use URL imports, not
// npm's node_modules resolution.
import { z } from "https://esm.sh/zod@3";

export const groundingCitationSchema = z.object({
  uri: z.string().url(),
  title: z.string().trim().max(500).optional(),
});
export type GroundingCitation = z.infer<typeof groundingCitationSchema>;

export const groundedResponseSchema = z.object({
  text: z.string().trim().min(1),
  citations: z.array(groundingCitationSchema),
  groundingMetadata: z.record(z.string(), z.unknown()),
});
export type GroundedResponse = z.infer<typeof groundedResponseSchema>;

/** NVIDIA NIM's OpenAI-compatible chat-completions response shape, narrowed to what this module reads. */
export const nvidiaChatCompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().trim().min(1) }) })).min(1),
});
export type NvidiaChatCompletion = z.infer<typeof nvidiaChatCompletionSchema>;
