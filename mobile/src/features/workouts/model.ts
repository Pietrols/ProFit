import { LOG_FIELDS, type LogField } from '../plans/types';
import type { SessionInput, SetInput, WorkoutSnapshot } from './types';

// These bounds mirror the strict wire schemas in backend/src/sync/collections.ts.
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue => typeof v === 'object' && v !== null && !Array.isArray(v);
const keys = (v: ObjectValue, allowed: string[]) => Object.keys(v).every((key) => allowed.includes(key));
const number = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) => number(v, min, max) && Number.isInteger(v);
const name = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 80;
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
export const validTime = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) && date(v.slice(0, 10)) && Number.isFinite(Date.parse(v)) && Number(v.slice(11, 13)) < 24;
const fields = (v: unknown): v is LogField[] => Array.isArray(v) && v.length > 0 && v.length <= 8 && v.every((f) => LOG_FIELDS.includes(f)) && new Set(v).size === v.length;

export function validateSnapshot(value: unknown): string | null {
  if (!object(value) || !keys(value, ['planName', 'dayName', 'difficulty', 'restDay', 'exercises']) ||
    !name(value.planName) || !name(value.dayName) || !['gentle', 'standard', 'hard'].includes(String(value.difficulty)) ||
    typeof value.restDay !== 'boolean' || !Array.isArray(value.exercises) || value.exercises.length > 100 ||
    (value.restDay ? value.exercises.length !== 0 : value.exercises.length === 0)) return 'Choose a training exercise or a rest day.';
  for (const e of value.exercises) {
    if (!object(e) || !keys(e, ['exerciseId', 'name', 'sets', 'targetReps', 'targetTimeSeconds', 'targetDistanceMetres', 'restSeconds', 'logFields']) ||
      typeof e.exerciseId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(e.exerciseId) || !name(e.name) ||
      !integer(e.sets, 1, 100) || !integer(e.restSeconds, 0, 3600) || !fields(e.logFields) ||
      (e.targetReps !== null && !integer(e.targetReps, 1, 1000)) ||
      (e.targetTimeSeconds !== null && !integer(e.targetTimeSeconds, 1, 86400)) ||
      (e.targetDistanceMetres !== null && !number(e.targetDistanceMetres, 1, 1000000))) return 'Check the exercise targets and selected fields.';
  }
  return null;
}
export function validateSession(value: unknown): string | null {
  if (!object(value) || !keys(value, ['planId', 'dayId', 'localDate', 'startedAt', 'endedAt', 'status', 'notes', 'easierToday', 'snapshot']) ||
    !uuid(value.planId) || !uuid(value.dayId) || !date(value.localDate) || !validTime(value.startedAt) ||
    !['active', 'completed', 'abandoned'].includes(String(value.status)) || typeof value.notes !== 'string' ||
    value.notes.length > 2000 || typeof value.easierToday !== 'boolean') return 'Check the session details.';
  if (value.status === 'active' ? value.endedAt !== null : !validTime(value.endedAt) || Date.parse(value.endedAt) < Date.parse(value.startedAt)) return 'The end time must match the status and follow the start.';
  return validateSnapshot(value.snapshot);
}
export function validateSet(value: unknown, snapshot?: WorkoutSnapshot): string | null {
  if (!object(value) || !keys(value, ['sessionId', 'exercisePosition', 'setIndex', 'loggedAt', 'logFields', 'values']) ||
    !uuid(value.sessionId) || !integer(value.exercisePosition, 0, 99) || !integer(value.setIndex, 0, 99) ||
    !validTime(value.loggedAt) || !fields(value.logFields) || !object(value.values)) return 'Check the set details.';
  const limits: Record<string, number> = { reps: 1000, weight: 2000, time: 86400, distance: 1000000, rest: 3600, RPE: 10 };
  for (const [field, v] of Object.entries(value.values)) {
    if (!value.logFields.includes(field as LogField)) return 'Only selected fields can be logged.';
    if (field === 'notes' ? typeof v !== 'string' || v.length > 2000 : field === 'done' ? typeof v !== 'boolean' :
      !number(v, 0, limits[field] ?? -1) || field === 'reps' && !Number.isInteger(v)) return 'Check the logged value and its limits.';
  }
  if (!Object.values(value.values).some((v) => typeof v === 'number' || v === true || typeof v === 'string' && v.trim().length > 0)) return 'Enter a result or mark done.';
  if (snapshot) {
    const exercise = snapshot.exercises[value.exercisePosition as number];
    if (!exercise || (value.setIndex as number) >= exercise.sets || exercise.logFields.length !== value.logFields.length ||
      exercise.logFields.some((f) => !(value.logFields as LogField[]).includes(f))) return 'This set does not match the session.';
  }
  return null;
}

export function sessionInput(session: SessionInput): SessionInput {
  const { planId, dayId, localDate, startedAt, endedAt, status, notes, easierToday, snapshot } = session;
  return { planId, dayId, localDate, startedAt, endedAt, status, notes, easierToday, snapshot };
}
export function setInput(set: SetInput): SetInput {
  const { sessionId, exercisePosition, setIndex, loggedAt, logFields, values } = set;
  return { sessionId, exercisePosition, setIndex, loggedAt, logFields, values };
}
