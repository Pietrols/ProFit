import { LOG_FIELDS, type LogField } from '../plans/types';
import type { SessionInput, SetInput, WorkoutSnapshot } from './types';

// These bounds mirror the strict wire schemas in backend/src/sync/collections.ts.
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const keys = (v: ObjectValue, allowed: string[]) =>
  Object.keys(v).every((key) => allowed.includes(key));
const number = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) =>
  number(v, min, max) && Number.isInteger(v);
const name = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 80;
export const validUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const date = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
export const validTime = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) &&
  date(v.slice(0, 10)) &&
  Number.isFinite(Date.parse(v)) &&
  Number(v.slice(11, 13)) < 24;
const fields = (v: unknown): v is LogField[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= 8 &&
  v.every((f) => LOG_FIELDS.includes(f)) &&
  new Set(v).size === v.length;

export function validateSnapshot(value: unknown): string | null {
  if (
    !object(value) ||
    !keys(value, ['planName', 'dayName', 'difficulty', 'restDay', 'exercises']) ||
    !name(value.planName) ||
    !name(value.dayName) ||
    !['gentle', 'standard', 'hard'].includes(String(value.difficulty)) ||
    typeof value.restDay !== 'boolean' ||
    !Array.isArray(value.exercises) ||
    value.exercises.length > 100 ||
    (value.restDay ? value.exercises.length !== 0 : value.exercises.length === 0)
  )
    return 'Choose a training exercise or a rest day.';
  for (const exercise of value.exercises) {
    const error = validateSnapshotExercise(exercise);
    if (error) return error;
  }
  return null;
}
function targetNumbers(value: ObjectValue): boolean {
  return (
    integer(value.sets, 1, 100) &&
    integer(value.restSeconds, 0, 3600) &&
    (value.targetReps === null || integer(value.targetReps, 1, 1000)) &&
    (value.targetTimeSeconds === null || integer(value.targetTimeSeconds, 1, 86400)) &&
    (value.targetDistanceMetres === null || number(value.targetDistanceMetres, 1, 1000000))
  );
}
export function validatePerformanceTargets(value: unknown): string | null {
  if (
    !object(value) ||
    !keys(value, [
      'sets',
      'targetReps',
      'targetTimeSeconds',
      'targetDistanceMetres',
      'restSeconds',
    ]) ||
    !targetNumbers(value)
  )
    return 'Check the targets at performance.';
  return null;
}
export function validateSnapshotExercise(value: unknown): string | null {
  if (
    !object(value) ||
    !keys(value, [
      'exerciseId',
      'name',
      'sets',
      'targetReps',
      'targetTimeSeconds',
      'targetDistanceMetres',
      'restSeconds',
      'logFields',
    ]) ||
    typeof value.exerciseId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(value.exerciseId) ||
    !name(value.name) ||
    !fields(value.logFields) ||
    !targetNumbers(value)
  )
    return 'Check the exercise targets and selected fields.';
  return null;
}
export function validateSession(value: unknown): string | null {
  if (
    !object(value) ||
    !keys(value, [
      'planId',
      'dayId',
      'localDate',
      'startedAt',
      'endedAt',
      'status',
      'notes',
      'easierToday',
      'snapshot',
    ]) ||
    !validUuid(value.planId) ||
    !validUuid(value.dayId) ||
    !date(value.localDate) ||
    !validTime(value.startedAt) ||
    !['active', 'completed', 'abandoned'].includes(String(value.status)) ||
    typeof value.notes !== 'string' ||
    value.notes.length > 2000 ||
    typeof value.easierToday !== 'boolean'
  )
    return 'Check the session details.';
  if (
    value.status === 'active'
      ? value.endedAt !== null
      : !validTime(value.endedAt) || Date.parse(value.endedAt) < Date.parse(value.startedAt)
  )
    return 'The end time must match the status and follow the start.';
  return validateSnapshot(value.snapshot);
}
export function validateLoggedValues(logFields: unknown, values: unknown): string | null {
  if (!fields(logFields) || !object(values)) return 'Check the set details.';
  const limits: Record<string, number> = {
    reps: 1000,
    weight: 2000,
    time: 86400,
    distance: 1000000,
    rest: 3600,
    RPE: 10,
  };
  for (const [field, v] of Object.entries(values)) {
    if (!logFields.includes(field as LogField)) return 'Only selected fields can be logged.';
    if (
      field === 'notes'
        ? typeof v !== 'string' || v.length > 2000
        : field === 'done'
          ? typeof v !== 'boolean'
          : !number(v, 0, limits[field] ?? -1) || (field === 'reps' && !Number.isInteger(v))
    )
      return 'Check the logged value and its limits.';
  }
  if (
    !Object.values(values).some(
      (v) => typeof v === 'number' || v === true || (typeof v === 'string' && v.trim().length > 0),
    )
  )
    return 'Enter a result or mark done.';
  return null;
}
export function validateSet(value: unknown, snapshot?: WorkoutSnapshot): string | null {
  if (
    !object(value) ||
    !keys(value, [
      'sessionId',
      'exercisePosition',
      'setIndex',
      'loggedAt',
      'logFields',
      'values',
    ]) ||
    !validUuid(value.sessionId) ||
    !integer(value.exercisePosition, 0, 99) ||
    !integer(value.setIndex, 0, 99) ||
    !validTime(value.loggedAt) ||
    !fields(value.logFields) ||
    !object(value.values)
  )
    return 'Check the set details.';
  const error = validateLoggedValues(value.logFields, value.values);
  if (error) return error;
  if (snapshot) {
    const exercise = snapshot.exercises[value.exercisePosition as number];
    if (
      !exercise ||
      (value.setIndex as number) >= exercise.sets ||
      exercise.logFields.length !== value.logFields.length ||
      exercise.logFields.some((f) => !(value.logFields as LogField[]).includes(f))
    )
      return 'This set does not match the session.';
  }
  return null;
}

export function sessionInput(session: SessionInput): SessionInput {
  const { planId, dayId, localDate, startedAt, endedAt, status, notes, easierToday, snapshot } =
    session;
  return { planId, dayId, localDate, startedAt, endedAt, status, notes, easierToday, snapshot };
}
export function setInput(set: SetInput): SetInput {
  const { sessionId, exercisePosition, setIndex, loggedAt, logFields, values } = set;
  return { sessionId, exercisePosition, setIndex, loggedAt, logFields, values };
}
