import type { SnapshotExercise, WorkoutSession } from './types';

export type PrefillHistoryField = 'weight' | 'reps' | 'time' | 'distance';
export function historyExerciseIds(session: WorkoutSession): string[] {
  return historyIdsForExercises(session.snapshot.exercises);
}
export function historyIdsForExercises(exercises: readonly SnapshotExercise[]): string[] {
  return [
    ...new Set([
      ...prefillRequestsForExercises(exercises).map((request) => request.exerciseId),
      ...exercises.filter((e) => e.logFields.includes('time')).map((e) => e.exerciseId),
    ]),
  ];
}
export function prefillHistoryRequests(session: WorkoutSession) {
  return prefillRequestsForExercises(session.snapshot.exercises);
}
export function prefillRequestsForExercises(exercises: readonly SnapshotExercise[]) {
  const requests = new Map<string, { exerciseId: string; field: PrefillHistoryField }>();
  for (const exercise of exercises) {
    const needs: [PrefillHistoryField, boolean][] = [
      ['weight', true],
      ['reps', exercise.targetReps === null],
      ['time', exercise.targetTimeSeconds === null],
      ['distance', exercise.targetDistanceMetres === null],
    ];
    for (const [field, missingTarget] of needs) {
      if (missingTarget && exercise.logFields.includes(field))
        requests.set(`${exercise.exerciseId}/${field}`, { exerciseId: exercise.exerciseId, field });
    }
  }
  return [...requests.values()];
}
