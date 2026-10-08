import type { Sql } from '../../lib/db/database';
import { uuidv5 } from '../../lib/uuid';

// Starred exercises. One row per user and exercise, with an id every phone derives the same way, so
// starring on two phones is one record and un-starring syncs as a delete.

// Fixed for good: changing it would split every favourite from its copy on other phones.
const FAVOURITE_NAMESPACE = '0d6b4f3a-8e2c-4b7a-9f1d-5c3e2a1b0f9e';

export const favouriteId = (userId: string, exerciseId: string) => uuidv5(`${userId}/${exerciseId}`, FAVOURITE_NAMESPACE);

export async function setFavourite(db: Sql, userId: string, exerciseId: string, on: boolean, now: Date): Promise<void> {
  const at = now.toISOString();
  await db.run(
    `INSERT INTO exercise_favourites (id, user_id, exercise_id, updated_at, deleted_at, dirty) VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, dirty = 1`,
    [favouriteId(userId, exerciseId), userId, exerciseId, at, on ? null : at],
  );
}

export async function listFavouriteIds(db: Sql, userId: string): Promise<Set<string>> {
  const rows = await db.all<{ exercise_id: string }>('SELECT exercise_id FROM exercise_favourites WHERE user_id = ? AND deleted_at IS NULL', [userId]);
  return new Set(rows.map((r) => r.exercise_id));
}
