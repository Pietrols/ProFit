import { DbLike } from './types';
import { WorkoutSessionPayload } from './workoutTypes';

/** Idempotent local write, keyed on the session's client UUID. */
export async function saveSessionLocal(
  db: DbLike,
  payload: WorkoutSessionPayload,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO workout_sessions (id, payload, finished_at, synced)
     VALUES (?,?,?,COALESCE((SELECT synced FROM workout_sessions WHERE id = ?), 0))`,
    [payload.id, JSON.stringify(payload), payload.finishedAt, payload.id],
  );
}

export async function getUnsyncedSessions(
  db: DbLike,
): Promise<WorkoutSessionPayload[]> {
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM workout_sessions WHERE synced = 0 ORDER BY finished_at ASC',
  );
  return rows.map((r) => JSON.parse(r.payload));
}

export async function markSessionsSynced(
  db: DbLike,
  ids: string[],
): Promise<void> {
  for (const id of ids) {
    await db.runAsync('UPDATE workout_sessions SET synced = 1 WHERE id = ?', [
      id,
    ]);
  }
}

export async function listSessionsLocal(
  db: DbLike,
): Promise<{ payload: WorkoutSessionPayload; synced: boolean }[]> {
  const rows = await db.getAllAsync<{ payload: string; synced: number }>(
    'SELECT payload, synced FROM workout_sessions ORDER BY finished_at DESC',
  );
  return rows.map((r) => ({ payload: JSON.parse(r.payload), synced: !!r.synced }));
}

export async function countSessions(db: DbLike): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM workout_sessions',
  );
  return row?.n ?? 0;
}
