import { completedSets, estimatedOneRepMax, type WorkoutHistory } from './logic';
import type { SetLog } from './types';

export type ExerciseHistoryRow = {
  id: string;
  sessionId: string;
  exerciseId: string;
  completedMs: number;
  loggedMs: number;
  weight: number | null;
  reps: number | null;
  time: number | null;
  distance: number | null;
  rest: number | null;
  eligibleWeight: number | null;
  oneRepMax: number | null;
  log: SetLog;
};

// Rebuildable comparison data. Canonical session/set validation stays in the existing logic.
export function projectWorkoutHistory({ session, logs }: WorkoutHistory): ExerciseHistoryRow[] {
  if (session.status !== 'completed' || session.endedAt === null) return [];
  const completedMs = Date.parse(session.endedAt);
  return completedSets(session, logs).map((log) => ({
    id: log.id,
    sessionId: session.id,
    exerciseId: session.snapshot.exercises[log.exercisePosition]!.exerciseId,
    completedMs,
    loggedMs: Date.parse(log.loggedAt),
    weight: log.values.weight ?? null,
    reps: log.values.reps ?? null,
    time: log.values.time ?? null,
    distance: log.values.distance ?? null,
    rest: log.values.rest ?? null,
    eligibleWeight: log.values.reps === 0 ? null : (log.values.weight ?? null),
    oneRepMax: estimatedOneRepMax(log.values.weight ?? 0, log.values.reps ?? 0),
    log: { ...log, logFields: [...log.logFields], values: { ...log.values } },
  }));
}
