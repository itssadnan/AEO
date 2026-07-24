import { z } from "zod";

export const signUpSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  workspaceName: z.string().trim().min(1).max(100),
});

export const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
