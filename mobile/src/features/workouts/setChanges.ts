import { LOG_FIELDS } from '../plans/types';
import { setInput, validateSet, validTime } from './model';
import { validateStableSetRecord } from './structureModel';
import type { WorkoutResult } from './structureTypes';
import type { SetValues } from './types';

export type SetRecord = WorkoutResult & { deletedAt: string | null };
export type SetUndoReceipt = { before: SetRecord; deletedRevision: string };
const copy = (record: SetRecord): SetRecord => ({
  ...record,
  logFields: [...record.logFields],
  values: { ...record.values },
  ...('itemId' in record ? { targetsAtPerformance: { ...record.targetsAtPerformance } } : {}),
});

export function setRevision(record: SetRecord): string {
  return JSON.stringify([
    record.id,
    record.sessionId,
    record.exercisePosition,
    record.setIndex,
    record.loggedAt,
    record.logFields,
    record.updatedAt,
    record.deletedAt,
    ...('itemId' in record
      ? [
          record.itemId,
          record.side,
          [
            record.targetsAtPerformance.sets,
            record.targetsAtPerformance.targetReps,
            record.targetsAtPerformance.targetTimeSeconds,
            record.targetsAtPerformance.targetDistanceMetres,
            record.targetsAtPerformance.restSeconds,
          ],
        ]
      : [null, null, null]),
    LOG_FIELDS.map((field) => record.values[field] ?? null),
  ]);
}
export class SetConflictError extends Error {
  readonly current: SetRecord;
  constructor(current: SetRecord) {
    super('This set changed. Review the saved result before trying again.');
    this.name = 'SetConflictError';
    this.current = copy(current);
  }
}
function expectRevision(current: SetRecord, expected: string) {
  if (setRevision(current) !== expected) throw new SetConflictError(current);
}
function nextEditTime(previous: string, now: Date): string {
  if (!validTime(previous) || !Number.isFinite(now.getTime()))
    throw new Error('Check the phone date before saving this result.');
  const next = new Date(Math.max(now.getTime(), Date.parse(previous) + 1)).toISOString();
  if (!validTime(next)) throw new Error('Check the phone date before saving this result.');
  return next;
}

export function correctSet(
  current: SetRecord,
  values: SetValues,
  expected: string,
  now: Date,
  restore = false,
): SetRecord {
  expectRevision(current, expected);
  if (current.deletedAt && !restore) throw new SetConflictError(current);
  const next = {
    ...copy(current),
    values: { ...values },
    deletedAt: null,
    updatedAt: nextEditTime(current.updatedAt, now),
  };
  const error = 'itemId' in next ? validateStableSetRecord(next) : validateSet(setInput(next));
  if (error) throw new Error(error);
  return next;
}
export function removeSet(current: SetRecord, expected: string, now: Date): SetRecord {
  expectRevision(current, expected);
  if (current.deletedAt) throw new SetConflictError(current);
  const updatedAt = nextEditTime(current.updatedAt, now);
  return { ...copy(current), updatedAt, deletedAt: updatedAt };
}
export function undoSet(receipt: SetUndoReceipt, current: SetRecord, now: Date): SetRecord {
  if (current.id !== receipt.before.id || !current.deletedAt) throw new SetConflictError(current);
  return correctSet(current, receipt.before.values, receipt.deletedRevision, now, true);
}
