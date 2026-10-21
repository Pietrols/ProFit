import { scaleTargets, type Completion } from '../plans/logic';
import type { Difficulty, Plan, PlanDay, PlanExercise, Targets } from '../plans/types';
import { setLogId } from './identity';
import {
  sessionInput,
  setInput,
  validateSession,
  validateSet,
  validateSnapshot,
  validTime,
} from './model';
import type { SetLog, SetValues, SnapshotExercise, WorkoutSession, WorkoutSnapshot } from './types';

type Stored<T> = T & { deletedAt?: string | null };
export type WorkoutHistory = { session: Stored<WorkoutSession>; logs: readonly Stored<SetLog>[] };
export type ExerciseSet = { exerciseId: string; log: Stored<SetLog> };
export type PersonalRecord = {
  metric: 'heaviestWeight' | 'repsAtWeight' | 'estimatedOneRepMax' | 'longestTime';
  value: number;
  previousBest: number | null;
  weightKg?: number;
};
const chronological = (a: SetLog, b: SetLog) =>
  Date.parse(a.loggedAt) - Date.parse(b.loggedAt) || a.id.localeCompare(b.id);
const liveSession = (s: Stored<WorkoutSession>) =>
  !s.deletedAt && validateSession(sessionInput(s)) === null;
const validLog = (s: Stored<SetLog>) =>
  !s.deletedAt && validateSet(setInput(s)) === null && s.values.done !== false;

export function sessionSnapshot(
  plan: Plan,
  day: PlanDay,
  exercises: readonly PlanExercise[],
  names: ReadonlyMap<string, string>,
): WorkoutSnapshot {
  if (day.planId !== plan.id) throw new Error('Choose a day from this plan.');
  const ordered = exercises
    .filter((e) => e.dayId === day.id)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const snapshot: WorkoutSnapshot = {
    planName: plan.name,
    dayName: day.name,
    difficulty: plan.difficulty,
    restDay: day.restDay,
    exercises: day.restDay
      ? []
      : ordered.map((e) => {
          const name = names.get(e.exerciseId);
          if (!name) throw new Error('An exercise is unavailable. Edit the plan before starting.');
          return {
            exerciseId: e.exerciseId,
            name,
            sets: e.sets,
            restSeconds: e.restSeconds,
            targetReps: e.targetReps,
            targetTimeSeconds: e.targetTimeSeconds,
            targetDistanceMetres: e.targetDistanceMetres,
            logFields: [...e.logFields],
          };
        }),
  };
  const error = validateSnapshot(snapshot);
  if (error) throw new Error(error);
  return snapshot;
}
export function sessionTargets(
  exercise: SnapshotExercise,
  difficulty: Difficulty,
  easierToday: boolean,
): Targets {
  return scaleTargets(exercise, easierToday ? 'gentle' : difficulty);
}

// Inputs come from the signed-in user's storage reads. Pick the latest edit before filtering
// deletions, so an old copy cannot resurrect a removed or explicitly incomplete set.
export function completedSets(
  session: Stored<WorkoutSession>,
  logs: readonly Stored<SetLog>[],
): SetLog[] {
  if (!liveSession(session)) return [];
  const latest = new Map<string, Stored<SetLog>>();
  for (const log of logs) {
    if (log.sessionId !== session.id || !validTime(log.updatedAt)) continue;
    const previous = latest.get(log.id);
    if (
      !previous ||
      Date.parse(log.updatedAt) > Date.parse(previous.updatedAt) ||
      (Date.parse(log.updatedAt) === Date.parse(previous.updatedAt) &&
        ((Boolean(log.deletedAt) && !previous.deletedAt) ||
          (Boolean(log.deletedAt) === Boolean(previous.deletedAt) &&
            JSON.stringify(log) > JSON.stringify(previous))))
    )
      latest.set(log.id, log);
  }
  return [...latest.values()]
    .filter(
      (log) =>
        validLog(log) &&
        !validateSet(setInput(log), session.snapshot) &&
        log.id === setLogId(session.id, log.exercisePosition, log.setIndex) &&
        Date.parse(log.loggedAt) >= Date.parse(session.startedAt) &&
        (session.endedAt === null || Date.parse(log.loggedAt) <= Date.parse(session.endedAt)),
    )
    .sort((a, b) => a.exercisePosition - b.exercisePosition || a.setIndex - b.setIndex);
}
export function workoutProgress(
  session: Stored<WorkoutSession>,
  logs: readonly Stored<SetLog>[],
): {
  total: number;
  completed: number;
  next: { exercisePosition: number; setIndex: number } | null;
} {
  const done = completedSets(session, logs);
  const slots = new Set(done.map((s) => `${s.exercisePosition}:${s.setIndex}`));
  let total = 0;
  let next: { exercisePosition: number; setIndex: number } | null = null;
  if (liveSession(session))
    session.snapshot.exercises.forEach((exercise, exercisePosition) => {
      total += exercise.sets;
      for (let setIndex = 0; setIndex < exercise.sets; setIndex += 1) {
        if (!next && !slots.has(`${exercisePosition}:${setIndex}`))
          next = { exercisePosition, setIndex };
      }
    });
  return { total, completed: done.length, next };
}

function historySets(history: readonly WorkoutHistory[], before: string): ExerciseSet[] {
  if (!validTime(before)) return [];
  return history.flatMap(({ session, logs }) => {
    if (
      !liveSession(session) ||
      session.status !== 'completed' ||
      Date.parse(session.endedAt!) > Date.parse(before)
    )
      return [];
    return completedSets(session, logs).map((log) => ({
      exerciseId: session.snapshot.exercises[log.exercisePosition]!.exerciseId,
      log,
    }));
  });
}
export function prefill(
  exercise: SnapshotExercise,
  targets: Targets,
  history: readonly WorkoutHistory[],
  before: string,
): SetValues {
  const previous = historySets(history, before)
    .filter((s) => s.exerciseId === exercise.exerciseId)
    .sort((a, b) => chronological(b.log, a.log));
  const result: SetValues = {};
  const preferred = {
    reps: targets.targetReps,
    time: targets.targetTimeSeconds,
    distance: targets.targetDistanceMetres,
    rest: exercise.restSeconds,
    weight: null,
  };
  for (const field of ['reps', 'weight', 'time', 'distance', 'rest'] as const) {
    if (!exercise.logFields.includes(field)) continue;
    const value =
      preferred[field] ??
      previous.find((s) => s.log.values[field] !== undefined)?.log.values[field];
    if (value !== undefined && value !== null) result[field] = value;
  }
  return result;
}
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    weightKg > 2000 ||
    !Number.isInteger(reps) ||
    reps < 1 ||
    reps > 10
  )
    return null;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}
export function personalRecords(
  candidate: ExerciseSet,
  previousLogs: readonly ExerciseSet[],
): PersonalRecord[] {
  if (!validLog(candidate.log)) return [];
  const previous = previousLogs.filter(
    (s) =>
      s.exerciseId === candidate.exerciseId &&
      validLog(s.log) &&
      chronological(s.log, candidate.log) < 0,
  );
  const v = candidate.log.values;
  const records: PersonalRecord[] = [];
  function compare(
    metric: PersonalRecord['metric'],
    value: number | null | undefined,
    metricValue: (values: SetValues) => number | null | undefined,
    weightKg?: number,
  ) {
    if (value === null || value === undefined || value <= 0) return;
    const values = previous
      .map((s) => metricValue(s.log.values))
      .filter((n): n is number => n !== null && n !== undefined && n > 0);
    const previousBest = values.length
      ? values.reduce((best, value) => Math.max(best, value), 0)
      : null;
    if (previousBest === null || value > previousBest)
      records.push({
        metric,
        value,
        previousBest,
        ...(weightKg === undefined ? {} : { weightKg }),
      });
  }
  const load = (values: SetValues) => (values.reps === 0 ? null : values.weight);
  compare('heaviestWeight', load(v), load);
  if (v.weight !== undefined)
    compare('repsAtWeight', v.reps, (p) => (p.weight === v.weight ? p.reps : null), v.weight);
  compare('estimatedOneRepMax', estimatedOneRepMax(v.weight ?? 0, v.reps ?? 0), (p) =>
    estimatedOneRepMax(p.weight ?? 0, p.reps ?? 0),
  );
  compare('longestTime', v.time, (p) => p.time);
  return records;
}
export function sessionVolume(
  session: Stored<WorkoutSession>,
  logs: readonly Stored<SetLog>[],
): number {
  return completedSets(session, logs).reduce(
    (total, log) => total + (log.values.weight ?? 0) * (log.values.reps ?? 0),
    0,
  );
}
export function sessionResults(
  session: Stored<WorkoutSession>,
  logs: readonly Stored<SetLog>[],
  history: readonly WorkoutHistory[],
) {
  const completed = completedSets(session, logs).sort(chronological);
  const earlier = historySets(
    history.filter((h) => h.session.id !== session.id),
    session.startedAt,
  );
  const records: { setId: string; exerciseId: string; record: PersonalRecord }[] = [];
  if (session.status !== 'abandoned')
    for (const log of completed) {
      const candidate = {
        exerciseId: session.snapshot.exercises[log.exercisePosition]!.exerciseId,
        log,
      };
      records.push(
        ...personalRecords(candidate, earlier).map((record) => ({
          setId: log.id,
          exerciseId: candidate.exerciseId,
          record,
        })),
      );
      earlier.push(candidate);
    }
  return {
    ...workoutProgress(session, logs),
    volumeKg: sessionVolume(session, logs),
    records,
  };
}
export function sessionSummary(
  session: Stored<WorkoutSession>,
  logs: readonly Stored<SetLog>[],
  history: readonly WorkoutHistory[],
  now: string,
) {
  const end = session.endedAt ?? now;
  const elapsedSeconds =
    liveSession(session) && validTime(end)
      ? Math.max(0, (Date.parse(end) - Date.parse(session.startedAt)) / 1000)
      : 0;
  return { ...sessionResults(session, logs, history), elapsedSeconds };
}
export function lastCompletion(
  planId: string,
  sessions: readonly Stored<WorkoutSession>[],
): Completion | null {
  const last = sessions
    .filter((s) => liveSession(s) && s.planId === planId && s.status === 'completed')
    .sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!) || a.id.localeCompare(b.id))[0];
  return last ? { planId, dayId: last.dayId, date: last.localDate } : null;
}
