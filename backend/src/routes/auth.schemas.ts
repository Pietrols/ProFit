import { z } from "zod";

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(72),
  displayName: z.string().min(1).max(50),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

// Email flows (AUDIT S3)
export const emailOnlySchema = z.object({ email: z.email() });
export const verifyEmailSchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
});
export const resetPasswordSchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
