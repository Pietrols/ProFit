import type { Database } from '../../lib/db/database';
import { getSession } from './sessionReads';
import { prepareStablePerformance, type StablePerformanceInput } from './stablePerformance';
import { sessionSlotId } from './structureIdentity';
import { validateSessionItem } from './structureModel';
import { readSessionStructure } from './structureReads';

export async function logStableSet(
  db: Database,
  user: string,
  input: StablePerformanceInput,
  now: Date,
): Promise<string> {
  const error = validateSessionItem(input.item);
  if (error) throw new Error(error);
  return db.transaction(async (tx) => {
    const session = await getSession(tx, user, input.item.sessionId);
    if (!session) throw new Error('This workout is no longer available.');
    const structure = await readSessionStructure(tx, user, session);
    if (!structure.resultView.available)
      throw new Error('Some workout data is unavailable. Refresh before logging.');
    const item = structure.itemView.items.find((item) => item.id === input.item.id);
    if (!item) throw new Error('This exercise is no longer available.');
    const id = sessionSlotId(item, input.setIndex);
    const previous = structure.resultRecords.find((record) => record.id === id) ?? null;
    const record = prepareStablePerformance(session, item, input, previous, now);
    const result = await tx.run(
      `INSERT INTO set_logs (id, user_id, session_id, exercise_position, set_index, logged_at,
        log_fields, values_json, updated_at, deleted_at, dirty, item_id, side, targets_at_performance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET exercise_position = excluded.exercise_position,
        set_index = excluded.set_index, logged_at = excluded.logged_at, log_fields = excluded.log_fields,
        values_json = excluded.values_json, updated_at = excluded.updated_at, deleted_at = NULL,
        dirty = 1, item_id = excluded.item_id, side = excluded.side, targets_at_performance = excluded.targets_at_performance
      WHERE set_logs.user_id = excluded.user_id AND set_logs.session_id = excluded.session_id AND set_logs.deleted_at IS NOT NULL`,
      [
        record.id,
        user,
        record.sessionId,
        record.exercisePosition,
        record.setIndex,
        record.loggedAt,
        JSON.stringify(record.logFields),
        JSON.stringify(record.values),
        record.updatedAt,
        record.itemId,
        record.side,
        JSON.stringify(record.targetsAtPerformance),
      ],
    );
    if (!result.changes) throw new Error('This slot is no longer available for a new performance.');
    return record.id;
  });
}
