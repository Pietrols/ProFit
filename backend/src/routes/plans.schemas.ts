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
        isDaily: z.boolean().default(false),
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

// Starter templates (Piece 1): list resolved for a context+experience, and
// create a plan from one. Experience defaults to beginner — templates target
// new users; intermediate/advanced resolve to the standard (non-regressed) form.
export const listTemplatesQuerySchema = z.object({
  context: z.enum(["home", "gym"]).default("gym"),
  experience: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
});

export const createFromTemplateSchema = z.object({
  templateId: z.string().min(1),
  context: z.enum(["home", "gym"]),
  experience: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type CreateCustomPlanInput = z.infer<typeof createCustomPlanSchema>;
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
export type CreateFromTemplateInput = z.infer<typeof createFromTemplateSchema>;
