import type { Database, Sql } from '../../lib/db/database';
import { getSession } from './sessionReads';
import { changeSessionItem, type ItemChange } from './sessionChanges';
import { readSessionStructure } from './structureReads';
import type { SessionItem } from './structureTypes';

export type SessionAdjustment = { kind: 'change'; item: SessionItem; change: ItemChange };

async function writeItems(tx: Sql, user: string, items: readonly SessionItem[]) {
  for (const item of items) {
    const written = await tx.run(
      `INSERT INTO session_items (id, user_id, session_id, origin, original_position,
        replaces_item_id, position, state, reason, exercise, updated_at, deleted_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET position = excluded.position, state = excluded.state,
        reason = excluded.reason, exercise = excluded.exercise, updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at, dirty = 1
       WHERE session_items.user_id = excluded.user_id AND session_items.session_id = excluded.session_id`,
      [
        item.id,
        user,
        item.sessionId,
        item.origin,
        item.originalPosition,
        item.replacesItemId,
        item.position,
        item.state,
        item.reason,
        JSON.stringify(item.exercise),
        item.updatedAt,
        item.deletedAt,
      ],
    );
    if (!written.changes)
      throw new Error('This exercise is unavailable. Refresh before changing it.');
  }
}

export async function adjustSession(
  db: Database,
  user: string,
  sessionId: string,
  command: SessionAdjustment,
  now: Date,
) {
  await db.transaction(async (tx) => {
    const session = await getSession(tx, user, sessionId);
    if (!session) throw new Error('This workout is no longer available.');
    const detail = { session, ...(await readSessionStructure(tx, user, session)) };
    const writes = [changeSessionItem(detail, command.item, command.change, now)];
    await writeItems(tx, user, writes);
  });
}
