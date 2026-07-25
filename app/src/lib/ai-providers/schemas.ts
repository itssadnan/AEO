import { z } from "zod";

export const aiTaskKeySchema = z.enum([
  "grounded_search",
  "extraction",
  "explanation_generation",
  "prompt_suggestion",
  "outreach_email_drafting",
]);
export type AiTaskKey = z.infer<typeof aiTaskKeySchema>;

export const resolvedTaskModelSchema = z.object({
  provider: z.enum(["gemini", "nvidia_nim"]),
  model: z.string().trim().min(1).max(200),
});
export type ResolvedTaskModel = z.infer<typeof resolvedTaskModelSchema>;

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

/**
 * NVIDIA NIM's OpenAI-compatible chat-completions response shape, narrowed
 * to what this module reads. Mirrored in
 * app/supabase/functions/_shared/schemas.ts for the Deno edge function --
 * see key-pool.ts's duplication note for why these can't just be imported
 * from one place.
 */
export const nvidiaChatCompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().trim().min(1) }) })).min(1),
});
export type NvidiaChatCompletion = z.infer<typeof nvidiaChatCompletionSchema>;
