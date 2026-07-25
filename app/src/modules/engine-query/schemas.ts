import { z } from "zod";
export const freeCheckRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  promptId: z.string().uuid(),
});
export type FreeCheckRequest = z.infer<typeof freeCheckRequestSchema>;
