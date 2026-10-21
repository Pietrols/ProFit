import { completedSets, estimatedOneRepMax, type ExerciseSet, type WorkoutHistory } from './logic';
import { sessionInput, validateSession } from './model';
import type { WorkoutResult } from './structureTypes';
import type { WorkoutSession } from './types';

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
  log: WorkoutResult;
};

// Rebuildable comparison data. Canonical session/set validation stays in the existing logic.
export function projectWorkoutHistory({ session, logs }: WorkoutHistory): ExerciseHistoryRow[] {
  return projectPerformedHistory(
    session,
    completedSets(session, logs).map((log) => ({
      exerciseId: session.snapshot.exercises[log.exercisePosition]!.exerciseId,
      log,
    })),
  );
}

// Results have already passed the owned session/item/slot join. Keep both wire variants intact.
export function projectPerformedHistory(
  session: WorkoutSession & { deletedAt?: string | null },
  results: readonly ExerciseSet[],
): ExerciseHistoryRow[] {
  if (
    session.deletedAt ||
    validateSession(sessionInput(session)) ||
    session.status !== 'completed' ||
    session.endedAt === null
  )
    return [];
  const completedMs = Date.parse(session.endedAt);
  return results.map(({ exerciseId, log }) => ({
    id: log.id,
    sessionId: session.id,
    exerciseId,
    completedMs,
    loggedMs: Date.parse(log.loggedAt),
    weight: log.values.weight ?? null,
    reps: log.values.reps ?? null,
    time: log.values.time ?? null,
    distance: log.values.distance ?? null,
    rest: log.values.rest ?? null,
    eligibleWeight: log.values.reps === 0 ? null : (log.values.weight ?? null),
    oneRepMax: estimatedOneRepMax(log.values.weight ?? 0, log.values.reps ?? 0),
    log: {
      ...log,
      logFields: [...log.logFields],
      values: { ...log.values },
      ...('itemId' in log ? { targetsAtPerformance: { ...log.targetsAtPerformance } } : {}),
    },
  }));
}
