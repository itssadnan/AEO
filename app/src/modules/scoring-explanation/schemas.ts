import { z } from "zod";

export const explanationResultSchema = z.object({
  explanation_text: z.string().trim().min(1).max(1000),
  recommended_actions: z
    .array(
      z.object({
        action: z.string().trim().min(1).max(300),
        confidence: z.enum(["high", "medium", "low"]),
        rationale: z.string().trim().min(1).max(500),
      }),
    )
    .min(1)
    .max(10),
});

export type ExplanationResult = z.infer<typeof explanationResultSchema>;
