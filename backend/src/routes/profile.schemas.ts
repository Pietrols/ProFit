import { z } from "zod";

export const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(50),
    goal: z.enum(["bulking", "cutting", "maintaining"]),
    trainingDays: z.int().min(2).max(7),
    defaultContext: z.enum(["home", "gym"]),
    units: z.enum(["kg", "lb"]),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
