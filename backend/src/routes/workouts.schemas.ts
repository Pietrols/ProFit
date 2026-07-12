import { z } from "zod";

// The planned-vs-actual delta — the shape the Phase 6 AI layer will consume.
// Computed on device at session finish; validated and stored verbatim.
export const sessionDeltaSchema = z.object({
  plannedExerciseCount: z.int().min(0),
  completedExerciseCount: z.int().min(0),
  plannedSetCount: z.int().min(0),
  completedSetCount: z.int().min(0),
  skippedExercises: z.array(
    z.object({ exerciseId: z.string(), name: z.string() }),
  ),
  swappedExercises: z.array(
    z.object({
      fromExerciseId: z.string(),
      toExerciseId: z.string(),
      reason: z.enum(["equipment", "injury", "preference", "unknown"]),
    }),
  ),
  cutShort: z.boolean(), // finished with uncompleted work remaining
});

const workoutSetSchema = z.object({
  id: z.uuid(),
  setIndex: z.int().min(0),
  plannedReps: z.string().nullable(),
  actualReps: z.int().min(0).nullable(),
  weightKg: z.number().min(0).nullable(),
  completed: z.boolean(),
});

const sessionExerciseSchema = z.object({
  id: z.uuid(),
  order: z.int().min(0),
  plannedExerciseId: z.string().nullable(),
  actualExerciseId: z.string(),
  skipped: z.boolean(),
  sets: z.array(workoutSetSchema),
});

export const workoutSessionSchema = z.object({
  id: z.uuid(), // client-generated: the idempotency key
  planId: z.string().nullable(),
  planDayId: z.string().nullable(),
  dayName: z.string().min(1).max(60),
  category: z.enum(["bodybuilding", "powerlifting", "crossfit", "cardio"]),
  context: z.enum(["home", "gym"]),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  durationSeconds: z.int().min(0),
  delta: sessionDeltaSchema,
  exercises: z.array(sessionExerciseSchema),
});

export const syncWorkoutsSchema = z.object({
  sessions: z.array(workoutSessionSchema).min(1).max(50),
});

export type SessionDelta = z.infer<typeof sessionDeltaSchema>;
export type WorkoutSessionInput = z.infer<typeof workoutSessionSchema>;
export type SyncWorkoutsInput = z.infer<typeof syncWorkoutsSchema>;
