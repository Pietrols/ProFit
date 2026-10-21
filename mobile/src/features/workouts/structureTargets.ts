import type { Difficulty } from '../plans/types';
import { sessionTargets } from './logic';
import { validateSnapshotExercise } from './model';
import type { PerformanceTargets } from './structureTypes';
import type { SnapshotExercise } from './types';

export function capturePerformanceTargets(
  exercise: SnapshotExercise,
  difficulty: Difficulty,
  easierToday: boolean,
): PerformanceTargets {
  const error = validateSnapshotExercise(exercise);
  if (error) throw new Error(error);
  return {
    sets: exercise.sets,
    ...sessionTargets(exercise, difficulty, easierToday),
    restSeconds: exercise.restSeconds,
  };
}
