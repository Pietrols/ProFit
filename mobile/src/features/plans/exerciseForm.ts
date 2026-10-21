import type { PlanExercise, PlanExerciseInput } from './types';
import { validatePlanExercise } from './plans';
export type TargetForm = {
  sets: string;
  reps: string;
  time: string;
  distance: string;
  rest: string;
};
export type TargetValues = Pick<
  PlanExerciseInput,
  'sets' | 'targetReps' | 'targetTimeSeconds' | 'targetDistanceMetres' | 'restSeconds'
>;
export function targetForm(exercise: TargetValues): TargetForm {
  return {
    sets: String(exercise.sets),
    reps: exercise.targetReps === null ? '' : String(exercise.targetReps),
    time: exercise.targetTimeSeconds === null ? '' : String(exercise.targetTimeSeconds),
    distance: exercise.targetDistanceMetres === null ? '' : String(exercise.targetDistanceMetres),
    rest: String(exercise.restSeconds),
  };
}
export function formTargets(form: TargetForm): TargetValues {
  const number = (text: string) => (/^\d+(\.\d+)?$/.test(text.trim()) ? Number(text.trim()) : NaN);
  const optional = (text: string) => (text.trim() === '' ? null : number(text));
  return {
    sets: number(form.sets),
    targetReps: optional(form.reps),
    targetTimeSeconds: optional(form.time),
    targetDistanceMetres: optional(form.distance),
    restSeconds: number(form.rest),
  };
}
export function formExercise(form: TargetForm, exercise: PlanExercise): PlanExerciseInput {
  const value = { ...exercise, ...formTargets(form) };
  const error = validatePlanExercise(value);
  if (error) throw new Error(error);
  return value;
}
export function nextPosition(items: { position: number }[]): number {
  return items.length ? Math.max(...items.map((item) => item.position)) + 1 : 0;
}
