// Pure planned-vs-actual computation — the honesty loop's output.
import { PlanDay } from '../../data/planRepo';
import {
  SessionDelta,
  SessionExercise,
  SwapReason,
} from '../../data/workoutTypes';

export function computeDelta(
  plannedDay: PlanDay | null,
  exercises: SessionExercise[],
  exerciseNames: Map<string, string>,
  swapReasons: Map<string, SwapReason>,
): SessionDelta {
  const plannedSetCount =
    plannedDay?.exercises.reduce((sum, pe) => sum + pe.sets, 0) ??
    exercises.reduce((sum, e) => sum + e.sets.length, 0);

  const completedSetCount = exercises
    .flatMap((e) => e.sets)
    .filter((s) => s.completed).length;

  const skippedExercises = exercises
    .filter((e) => e.skipped)
    .map((e) => ({
      exerciseId: e.plannedExerciseId ?? e.actualExerciseId,
      name:
        exerciseNames.get(e.plannedExerciseId ?? e.actualExerciseId) ??
        'unknown',
    }));

  const swappedExercises = exercises
    .filter(
      (e) =>
        !e.skipped &&
        e.plannedExerciseId !== null &&
        e.plannedExerciseId !== e.actualExerciseId,
    )
    .map((e) => ({
      fromExerciseId: e.plannedExerciseId!,
      toExerciseId: e.actualExerciseId,
      reason: swapReasons.get(e.id) ?? ('unknown' as SwapReason),
    }));

  const completedExerciseCount = exercises.filter(
    (e) => !e.skipped && e.sets.some((s) => s.completed),
  ).length;

  return {
    plannedExerciseCount: plannedDay?.exercises.length ?? exercises.length,
    completedExerciseCount,
    plannedSetCount,
    completedSetCount,
    skippedExercises,
    swappedExercises,
    cutShort: completedSetCount < plannedSetCount,
  };
}

export const KG_PER_LB = 0.45359237;
export const toKg = (value: number, units: 'kg' | 'lb') =>
  units === 'kg' ? value : value * KG_PER_LB;
export const fromKg = (kg: number, units: 'kg' | 'lb') =>
  units === 'kg' ? kg : kg / KG_PER_LB;
