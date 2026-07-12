import { DbLike } from './types';
import { WorkoutSessionPayload } from './workoutTypes';
import { getUnsyncedSessions, markSessionsSynced } from './workoutRepo';

export type WorkoutPoster = (
  sessions: WorkoutSessionPayload[],
) => Promise<{ synced: string[] }>;

/**
 * Push locally logged sessions to the backend. Safe to call any time
 * (finish, app start, reconnect): sessions are only marked synced after the
 * server acknowledges their ids, and the server upserts on the client UUID,
 * so a crash or dropped response between POST and ack just means a harmless
 * replay next time.
 */
export async function pushWorkouts(
  db: DbLike,
  post: WorkoutPoster,
): Promise<{ pushed: number; quarantined: number }> {
  const pending = await getUnsyncedSessions(db);
  if (pending.length === 0) return { pushed: 0, quarantined: 0 };
  try {
    const { synced } = await post(pending);
    await markSessionsSynced(db, synced);
    return { pushed: synced.length, quarantined: 0 };
  } catch (e) {
    // Sync-conflict hardening: a 4xx (validation / ownership conflict) will
    // never succeed on retry — quarantine the batch (synced = 2) so one bad
    // row can't poison the queue forever. Network/5xx errors rethrow and
    // the batch stays pending for the next attempt.
    const status = (e as { status?: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
      for (const s of pending) {
        await db.runAsync(
          'UPDATE workout_sessions SET synced = 2 WHERE id = ?',
          [s.id],
        );
      }
      return { pushed: 0, quarantined: pending.length };
    }
    throw e;
  }
}
