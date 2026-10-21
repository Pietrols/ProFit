import type { Database, Sql } from '../../lib/db/database';
import { sessionItemsView } from './sessionItemsView';
import { resultValidatorForItem } from './structureModel';
import {
  decodeItem,
  decodeResult,
  ITEM_COLUMNS,
  RESULT_COLUMNS,
  type ItemRow,
  type ResultRow,
} from './structureRows';
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
  const row = await tx.first<ResultRow>(
    `SELECT ${RESULT_COLUMNS}
     FROM set_logs WHERE id = ? AND session_id = ? AND user_id = ?`,
    [target.id, target.sessionId, user],
  );
  if (!row) throw new Error('This set is no longer available.');
  const record = decodeResult(row);
  const rows = await tx.all<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM session_items WHERE session_id = ? AND user_id = ?`,
    [session.id, user],
  );
  const decoded = rows.map((row) => ({ id: row.id, item: decodeItem(row) }));
  const view = sessionItemsView(
    session,
    decoded.flatMap(({ item }) => (item ? [item] : [])),
    decoded.filter(({ item }) => !item).map(({ id }) => id),
  );
  const item = record
    ? view.items.find((item) =>
        'itemId' in record
          ? item.id === record.itemId
          : item.origin === 'planned' && item.originalPosition === record.exercisePosition,
      )
    : null;
  if (!record || !item || resultValidatorForItem(session, item)(record))
    throw new Error('This set no longer matches the saved session.');
  return { ...record, deletedAt: record.deletedAt ?? null };
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
