// Mirrors backend/src/routes/workouts.schemas.ts — the sync payload and the
// planned-vs-actual delta (the shape the Phase 6 AI layer will consume).
import { TrainingContext } from '../api/types';
import { ExerciseCategory } from './types';

export interface WorkoutSet {
  id: string;
  setIndex: number;
  plannedReps: string | null;
  actualReps: number | null;
  weightKg: number | null;
  completed: boolean;
}

export interface SessionExercise {
  id: string;
  order: number;
  plannedExerciseId: string | null;
  actualExerciseId: string;
  skipped: boolean;
  sets: WorkoutSet[];
}

export type SwapReason = 'equipment' | 'injury' | 'preference' | 'unknown';

export interface SessionDelta {
  plannedExerciseCount: number;
  completedExerciseCount: number;
  plannedSetCount: number;
  completedSetCount: number;
  skippedExercises: { exerciseId: string; name: string }[];
  swappedExercises: {
    fromExerciseId: string;
    toExerciseId: string;
    reason: SwapReason;
  }[];
  cutShort: boolean;
}

export interface WorkoutSessionPayload {
  id: string; // client UUID — the idempotency key
  planId: string | null;
  planDayId: string | null;
  dayName: string;
  category: ExerciseCategory;
  context: TrainingContext;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  delta: SessionDelta;
  exercises: SessionExercise[];
}
