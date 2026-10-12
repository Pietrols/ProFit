import type { WorkoutSnapshot, SessionInput, SetInput } from '../types';
export const user = '00000000-0000-4000-8000-000000000001';
export const other = '00000000-0000-4000-8000-000000000002';
export const sessionId = '00000000-0000-4000-8000-000000000003';
export const at = (n: number) => new Date(Date.UTC(2026, 9, 9, 9, n));
export const snapshot = (): WorkoutSnapshot => ({
  planName: 'My cycle', dayName: 'Push', difficulty: 'standard', restDay: false,
  exercises: [{ exerciseId: 'Barbell_Bench_Press', name: 'Bench press', sets: 3, targetReps: 8,
    targetTimeSeconds: null, targetDistanceMetres: null, restSeconds: 60, logFields: ['reps', 'weight', 'RPE', 'notes'] }],
});
export const session = (): SessionInput => ({ planId: user, dayId: other, localDate: '2026-10-09',
  startedAt: at(0).toISOString(), endedAt: null, status: 'active', notes: '', easierToday: false, snapshot: snapshot() });
export const set = (id = sessionId): SetInput => ({ sessionId: id, exercisePosition: 0, setIndex: 0,
  loggedAt: at(1).toISOString(), logFields: ['reps', 'weight', 'RPE', 'notes'], values: { reps: 8, weight: 45, RPE: 7.5, notes: 'Smooth' } });
