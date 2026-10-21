import type { Database, Sql } from '../../lib/db/database';
import { sessionItemsView } from './sessionItemsView';
import {
  decodeItem,
  decodeResult,
  ITEM_COLUMNS,
  RESULT_COLUMNS,
  type ItemRow,
  type ResultRow,
} from './structureRows';
import type { SessionItem, WorkoutResult } from './structureTypes';
import type { WorkoutSession } from './types';
import { workoutResultsView } from './workoutResultsView';
import { getSession } from './workouts';

// The caller must read this owned parent in the same transaction, as below.
export async function readSessionStructure(tx: Sql, user: string, session: WorkoutSession) {
  const itemRows = await tx.all<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM session_items WHERE user_id = ? AND session_id = ?`,
    [user, session.id],
  );
  const resultRows = await tx.all<ResultRow>(
    `SELECT ${RESULT_COLUMNS} FROM set_logs WHERE user_id = ? AND session_id = ?`,
    [user, session.id],
  );
  const itemRecords: SessionItem[] = [];
  const resultRecords: WorkoutResult[] = [];
  const unavailableItems: string[] = [];
  const unavailableResults: string[] = [];
  for (const row of itemRows) {
    const item = decodeItem(row);
    if (item) itemRecords.push(item);
    else unavailableItems.push(row.id);
  }
  for (const row of resultRows) {
    const result = decodeResult(row);
    if (result) resultRecords.push(result);
    else unavailableResults.push(row.id);
  }
  const itemView = sessionItemsView(session, itemRecords, unavailableItems);
  return {
    itemRecords,
    resultRecords,
    itemView,
    resultView: workoutResultsView(session, itemView, resultRecords, unavailableResults),
  };
}

export function readStructuredWorkout(db: Database, user: string, id: string) {
  return db.transaction(async (tx) => {
    const session = await getSession(tx, user, id);
    if (!session) return null;
    return { session, ...(await readSessionStructure(tx, user, session)) };
  });
}
