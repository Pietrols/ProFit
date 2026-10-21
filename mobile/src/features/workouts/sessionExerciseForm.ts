import type { Exercise } from '../exercises/types';
import { defaultLogFields } from '../plans/logic';
import { formTargets, type TargetForm } from '../plans/exerciseForm';
import type { LogField } from '../plans/types';
import { validateSnapshotExercise } from './model';
import type { SnapshotExercise } from './types';

export function exerciseForWorkout(exercise: Exercise): SnapshotExercise {
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    sets: 3,
    targetReps: null,
    targetTimeSeconds: null,
    targetDistanceMetres: null,
    restSeconds: 60,
    logFields: defaultLogFields(exercise.tracking),
  };
}

export function parseSessionExercise(form: TargetForm, fields: LogField[], base: SnapshotExercise) {
  const exercise = { ...base, ...formTargets(form), logFields: [...fields] };
  const error = validateSnapshotExercise(exercise);
  if (error) throw new Error(error);
  return exercise;
}
