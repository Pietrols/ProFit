import {
  setInput,
  validTime,
  validUuid,
  validateLoggedValues,
  validatePerformanceTargets,
  validateSnapshotExercise,
  validateSet,
} from './model';
import { uuidv5 } from '../../lib/uuid';
import { setLogId } from './identity';
import { plannedItemId } from './structureIdentity';
import type { SessionItem, StableSetLog, WorkoutResult } from './structureTypes';
import type { SetLog, WorkoutSession } from './types';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: ObjectValue, allowed: readonly string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
const index = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99;
const validEdit = (value: ObjectValue) =>
  validUuid(value.id) &&
  validTime(value.updatedAt) &&
  (value.deletedAt === null || validTime(value.deletedAt));

export function validateSessionItem(value: unknown, session?: WorkoutSession): string | null {
  if (
    !object(value) ||
    !keys(value, [
      'id',
      'sessionId',
      'updatedAt',
      'deletedAt',
      'origin',
      'originalPosition',
      'replacesItemId',
      'position',
      'state',
      'reason',
      'exercise',
    ]) ||
    !validEdit(value) ||
    !validUuid(value.sessionId) ||
    typeof value.position !== 'number' ||
    !Number.isInteger(value.position) ||
    value.position < 0 ||
    value.position > 10000 ||
    !['active', 'skipped', 'removed'].includes(String(value.state)) ||
    (value.reason !== null && (typeof value.reason !== 'string' || value.reason.length > 500)) ||
    validateSnapshotExercise(value.exercise)
  )
    return 'Check the session exercise details.';
  if (value.origin === 'planned') {
    if (
      !index(value.originalPosition) ||
      value.replacesItemId !== null ||
      plannedItemId(value.sessionId, value.originalPosition) !== value.id
    )
      return 'This exercise no longer matches its original identity.';
  } else {
    if (
      value.originalPosition !== null ||
      (value.origin === 'added'
        ? value.replacesItemId !== null
        : value.origin !== 'replacement' ||
          !validUuid(value.replacesItemId) ||
          value.replacesItemId === value.id)
    )
      return 'Check the added or replacement exercise identity.';
  }
  if (session) {
    if (value.sessionId !== session.id) return 'Choose an exercise from this session.';
    const exercise = value.exercise as SessionItem['exercise'];
    if (
      value.origin === 'planned' &&
      session.snapshot.exercises[value.originalPosition as number]?.exerciseId !==
        exercise.exerciseId
    )
      return 'Replacing an exercise requires a new session item.';
    if (
      value.origin !== 'planned' &&
      session.snapshot.exercises.some(
        (_, position) => plannedItemId(session.id, position) === value.id,
      )
    )
      return 'An added exercise cannot replace an original identity.';
  }
  return null;
}

export function validateStableSetRecord(value: unknown): string | null {
  if (
    !object(value) ||
    !keys(value, [
      'id',
      'updatedAt',
      'deletedAt',
      'sessionId',
      'exercisePosition',
      'setIndex',
      'loggedAt',
      'logFields',
      'values',
      'itemId',
      'side',
      'targetsAtPerformance',
    ]) ||
    !validUuid(value.id) ||
    !validTime(value.updatedAt) ||
    (value.deletedAt !== undefined && value.deletedAt !== null && !validTime(value.deletedAt)) ||
    !validUuid(value.sessionId) ||
    !validUuid(value.itemId) ||
    (value.exercisePosition !== null && !index(value.exercisePosition)) ||
    !index(value.setIndex) ||
    !validTime(value.loggedAt) ||
    value.side !== 'bilateral' ||
    validatePerformanceTargets(value.targetsAtPerformance)
  )
    return 'Check the structured set details.';
  const error = validateLoggedValues(value.logFields, value.values);
  if (error) return error;
  if (value.setIndex >= (value.targetsAtPerformance as StableSetLog['targetsAtPerformance']).sets)
    return 'This slot did not exist at performance.';
  return null;
}

// Shape validation alone cannot make an orphan result eligible for history or progress.
export function validateStableSetContext(
  result: StableSetLog,
  item: SessionItem,
  session: WorkoutSession,
): string | null {
  const error = validateStableSetRecord(result);
  if (error) return error;
  return resultValidatorForItem(session, item)(result);
}

export function validateLegacySetContext(
  result: SetLog,
  item: SessionItem,
  session: WorkoutSession,
): string | null {
  if ('itemId' in result || 'side' in result || 'targetsAtPerformance' in result)
    return 'This result is not in the legacy format.';
  return resultValidatorForItem(session, item)(result);
}

// Build once per item in a synchronous read snapshot, then validate each result against it.
export function resultValidatorForItem(session: WorkoutSession, item: SessionItem) {
  const itemError = validateSessionItem(item, session);
  const { id, origin, originalPosition } = item;
  const sessionId = session.id;
  const start = Date.parse(session.startedAt);
  const end = session.endedAt === null ? Infinity : Date.parse(session.endedAt);
  return (result: WorkoutResult): string | null => {
    if (itemError) return itemError;
    const stable = 'itemId' in result;
    const error = stable
      ? validateStableSetRecord(result)
      : validateSet(setInput(result), session.snapshot);
    if (error) return error;
    const slotId =
      origin === 'planned'
        ? setLogId(sessionId, originalPosition, result.setIndex)
        : uuidv5(`set:${result.setIndex}`, id);
    if (
      result.sessionId !== sessionId ||
      result.exercisePosition !== originalPosition ||
      result.id !== slotId ||
      (stable
        ? result.itemId !== id
        : origin !== 'planned' || 'side' in result || 'targetsAtPerformance' in result)
    )
      return 'This set does not match its session exercise and slot.';
    const time = Date.parse(result.loggedAt);
    if (time < start || time > end) return 'Log the set within the session times.';
    return null;
  };
}
