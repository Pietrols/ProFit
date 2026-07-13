import { z } from "zod";

// Cover image is optional, stored inline as a data URI or URL. Capped so a
// request stays sane (MVP — object storage is the eventual home; see DECISIONS).
const coverImageSchema = z.string().max(900_000).nullable().default(null);

export const createUserWorkoutSchema = z.object({
  name: z.string().min(1).max(60),
  isPublic: z.boolean().default(false),
  coverImage: coverImageSchema,
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
});

// AI cover-image suggestion (Group F). Genuinely separate from aiJson() (which
// is text/JSON only). Gated behind AI_ENABLED like every other AI touchpoint.
export const suggestImageSchema = z.object({
  name: z.string().min(1).max(60),
});

export type CreateUserWorkoutInput = z.infer<typeof createUserWorkoutSchema>;
export type SuggestImageInput = z.infer<typeof suggestImageSchema>;
