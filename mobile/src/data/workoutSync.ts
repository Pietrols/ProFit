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
): Promise<{ pushed: number }> {
  const pending = await getUnsyncedSessions(db);
  if (pending.length === 0) return { pushed: 0 };
  const { synced } = await post(pending);
  await markSessionsSynced(db, synced);
  return { pushed: synced.length };
}
