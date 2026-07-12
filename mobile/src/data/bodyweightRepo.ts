import { DbLike } from './types';

export interface BodyweightEntry {
  id: string;
  weightKg: number;
  loggedAt: string;
}

/** Idempotent local write; preserves the synced flag on re-save. */
export async function saveBodyweightLocal(
  db: DbLike,
  entry: BodyweightEntry,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO bodyweight_entries (id, weight_kg, logged_at, synced)
     VALUES (?,?,?,COALESCE((SELECT synced FROM bodyweight_entries WHERE id = ?), 0))`,
    [entry.id, entry.weightKg, entry.loggedAt, entry.id],
  );
}

export async function listBodyweightLocal(
  db: DbLike,
): Promise<BodyweightEntry[]> {
  const rows = await db.getAllAsync<{
    id: string;
    weight_kg: number;
    logged_at: string;
  }>('SELECT * FROM bodyweight_entries ORDER BY logged_at ASC');
  return rows.map((r) => ({
    id: r.id,
    weightKg: r.weight_kg,
    loggedAt: r.logged_at,
  }));
}

export async function getUnsyncedBodyweight(
  db: DbLike,
): Promise<BodyweightEntry[]> {
  const rows = await db.getAllAsync<{
    id: string;
    weight_kg: number;
    logged_at: string;
  }>('SELECT * FROM bodyweight_entries WHERE synced = 0 ORDER BY logged_at ASC');
  return rows.map((r) => ({
    id: r.id,
    weightKg: r.weight_kg,
    loggedAt: r.logged_at,
  }));
}

export async function markBodyweightSynced(
  db: DbLike,
  ids: string[],
): Promise<void> {
  for (const id of ids) {
    await db.runAsync(
      'UPDATE bodyweight_entries SET synced = 1 WHERE id = ?',
      [id],
    );
  }
}

export type BodyweightPoster = (
  entries: BodyweightEntry[],
) => Promise<{ synced: string[] }>;

/** Same replay-safe contract as pushWorkouts. */
export async function pushBodyweight(
  db: DbLike,
  post: BodyweightPoster,
): Promise<{ pushed: number }> {
  const pending = await getUnsyncedBodyweight(db);
  if (pending.length === 0) return { pushed: 0 };
  const { synced } = await post(pending);
  await markBodyweightSynced(db, synced);
  return { pushed: synced.length };
}
