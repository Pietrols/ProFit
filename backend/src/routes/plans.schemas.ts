import { z } from "zod";

export const createPlanSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  context: z.enum(["home", "gym"]),
  days: z
    .array(
      z.object({
        category: z.enum(["bodybuilding", "powerlifting", "crossfit", "cardio"]),
      }),
    )
    .min(2)
    .max(7),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
