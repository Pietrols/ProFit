import type { WorkoutSession } from './types';

export type PrefillHistoryField = 'weight' | 'reps' | 'time' | 'distance';
export function historyExerciseIds(session: WorkoutSession): string[] {
  return [
    ...new Set([
      ...prefillHistoryRequests(session).map((request) => request.exerciseId),
      ...session.snapshot.exercises
        .filter((e) => e.logFields.includes('time'))
        .map((e) => e.exerciseId),
    ]),
  ];
}
export function prefillHistoryRequests(session: WorkoutSession) {
  const requests = new Map<string, { exerciseId: string; field: PrefillHistoryField }>();
  for (const exercise of session.snapshot.exercises) {
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
