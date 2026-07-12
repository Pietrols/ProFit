import { z } from "zod";

export const listExercisesSchema = z.object({
  // ISO timestamp; only exercises updated after this are returned (sync cursor)
  updatedSince: z.iso.datetime().optional(),
});

export type ListExercisesInput = z.infer<typeof listExercisesSchema>;
