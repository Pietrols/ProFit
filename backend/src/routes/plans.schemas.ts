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

// Fully-custom plan (Group D): named days, hand-picked exercises with
// per-exercise sets/reps/duration/rest, plus plan-level timer settings.
export const createCustomPlanSchema = z.object({
  name: z.string().min(1).max(60),
  context: z.enum(["home", "gym"]),
  timers: z.object({
    defaultRestSeconds: z.int().min(0).max(1200).default(90),
    workIntervalSeconds: z.int().min(0).max(1200).nullable().default(null),
    autoAdvance: z.boolean().default(true),
  }),
  days: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        category: z.enum([
          "bodybuilding",
          "powerlifting",
          "crossfit",
          "cardio",
        ]),
        exercises: z
          .array(
            z.object({
              exerciseId: z.string().min(1),
              sets: z.int().min(1).max(20),
              reps: z.string().min(1).max(40),
              restSeconds: z.int().min(0).max(1200),
              durationSeconds: z.int().min(0).max(7200).nullable().default(null),
            }),
          )
          .min(1)
          .max(30),
      }),
    )
    .min(1)
    .max(7),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type CreateCustomPlanInput = z.infer<typeof createCustomPlanSchema>;
