import type { Database, Sql } from '../../lib/db/database';
import { setLogId } from './identity';
import { setInput, validateSet, validTime } from './model';
import {
  correctSet,
  removeSet,
  setRevision,
  undoSet,
  type SetRecord,
  type SetUndoReceipt,
} from './setChanges';
import type { SetValues } from './types';
import { getSession } from './workouts';

async function readRecord(tx: Sql, user: string, target: SetRecord): Promise<SetRecord> {
  const session = await getSession(tx, user, target.sessionId);
  if (!session || session.status === 'abandoned')
    throw new Error('This session is no longer available for corrections.');
  const row = await tx.first<
    Omit<SetRecord, 'logFields' | 'values'> & { logFields: string; values: string }
  >(
    `SELECT id, session_id AS sessionId, exercise_position AS exercisePosition,
     set_index AS setIndex, logged_at AS loggedAt, log_fields AS logFields,
     values_json AS [values], updated_at AS updatedAt, deleted_at AS deletedAt
     FROM set_logs WHERE id = ? AND session_id = ? AND user_id = ?`,
    [target.id, target.sessionId, user],
  );
  if (!row) throw new Error('This set is no longer available.');
  const record: SetRecord = {
    ...row,
    logFields: JSON.parse(row.logFields) as SetRecord['logFields'],
    values: JSON.parse(row.values) as SetValues,
  };
  if (
    validateSet(setInput(record), session.snapshot) ||
    record.id !== setLogId(record.sessionId, record.exercisePosition, record.setIndex) ||
    !validTime(record.updatedAt) ||
    (record.deletedAt !== null && !validTime(record.deletedAt)) ||
    Date.parse(record.loggedAt) < Date.parse(session.startedAt) ||
    (session.endedAt && Date.parse(record.loggedAt) > Date.parse(session.endedAt))
  )
    throw new Error('This set no longer matches the saved session.');
  return record;
}

async function writeRecord(tx: Sql, user: string, record: SetRecord) {
  await tx.run(
    `UPDATE set_logs SET values_json = ?, updated_at = ?, deleted_at = ?, dirty = 1
     WHERE id = ? AND session_id = ? AND user_id = ?`,
    [
      JSON.stringify(record.values),
      record.updatedAt,
      record.deletedAt,
      record.id,
      record.sessionId,
      user,
    ],
  );
}

export async function correctLoggedSet(
  db: Database,
  user: string,
  target: SetRecord,
  values: SetValues,
  now: Date,
  restore = false,
): Promise<SetRecord> {
  return db.transaction(async (tx) => {
    const current = await readRecord(tx, user, target);
    const next = correctSet(current, values, setRevision(target), now, restore);
    await writeRecord(tx, user, next);
    return next;
  });
}

export async function removeLoggedSet(
  db: Database,
  user: string,
  target: SetRecord,
  now: Date,
): Promise<SetUndoReceipt> {
  return db.transaction(async (tx) => {
    const current = await readRecord(tx, user, target);
    const removed = removeSet(current, setRevision(target), now);
    await writeRecord(tx, user, removed);
    return { before: current, deletedRevision: setRevision(removed) };
  });
}

export async function undoLoggedSet(
  db: Database,
  user: string,
  receipt: SetUndoReceipt,
  now: Date,
): Promise<SetRecord> {
  return db.transaction(async (tx) => {
    const current = await readRecord(tx, user, receipt.before);
    const next = undoSet(receipt, current, now);
    await writeRecord(tx, user, next);
    return next;
  });
}
