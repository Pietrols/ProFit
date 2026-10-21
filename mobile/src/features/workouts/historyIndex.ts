import type { Database, Sql, SqlValue } from '../../lib/db/database';
import { projectWorkoutHistory, type ExerciseHistoryRow } from './historyProjection';
import type { SetLog } from './types';
import { readSession, SESSION_COLUMNS, type SessionRow } from './workouts';

type StoredSet = Omit<SetLog, 'logFields' | 'values'> & { logFields: string; values: string };
const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');
const COLUMNS =
  'id, user_id, session_id, exercise_id, completed_ms, logged_ms, weight, reps, time, distance, rest, eligible_weight, one_rep_max, log_json';

async function writeRows(tx: Sql, user: string, rows: ExerciseHistoryRow[]) {
  // Keep each statement below the older SQLite 999-parameter limit.
  for (let start = 0; start < rows.length; start += 50) {
    const batch = rows.slice(start, start + 50);
    const values: SqlValue[] = batch.flatMap((row) => [
      row.id,
      user,
      row.sessionId,
      row.exerciseId,
      row.completedMs,
      row.loggedMs,
      row.weight,
      row.reps,
      row.time,
      row.distance,
      row.rest,
      row.eligibleWeight,
      row.oneRepMax,
      JSON.stringify(row.log),
    ]);
    await tx.run(
      `INSERT INTO workout_history_index (${COLUMNS}) VALUES ${batch.map(() => `(${placeholders(14)})`).join(', ')}`,
      values,
    );
  }
}

async function refreshBatch(tx: Sql, user: string) {
  const dirty = await tx.all<{ session_id: string }>(
    'SELECT session_id FROM workout_history_dirty WHERE user_id = ? ORDER BY session_id LIMIT 25',
    [user],
  );
  if (!dirty.length) return { sessions: 0, results: 0 };
  const ids = dirty.map((row) => row.session_id);
  const owned = `user_id = ? AND session_id IN (${placeholders(ids.length)})`;
  await tx.run(`DELETE FROM workout_history_index WHERE ${owned}`, [user, ...ids]);
  const sessions = (
    await tx.all<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE user_id = ? AND id IN (${placeholders(ids.length)})
     AND status = 'completed' AND deleted_at IS NULL`,
      [user, ...ids],
    )
  ).map(readSession);
  const completedIds = sessions.map((session) => session.id);
  const groups = new Map<string, SetLog[]>();
  if (completedIds.length) {
    const stored = await tx.all<StoredSet>(
      `SELECT id, session_id AS sessionId, exercise_position AS exercisePosition, set_index AS setIndex,
       logged_at AS loggedAt, log_fields AS logFields, values_json AS [values], updated_at AS updatedAt
       FROM set_logs WHERE user_id = ? AND session_id IN (${placeholders(completedIds.length)}) AND deleted_at IS NULL`,
      [user, ...completedIds],
    );
    for (const row of stored) {
      const logs = groups.get(row.sessionId) ?? [];
      logs.push({
        ...row,
        logFields: JSON.parse(row.logFields) as SetLog['logFields'],
        values: JSON.parse(row.values) as SetLog['values'],
      });
      groups.set(row.sessionId, logs);
    }
  }
  const projected = sessions.flatMap((session) =>
    projectWorkoutHistory({ session, logs: groups.get(session.id) ?? [] }),
  );
  await writeRows(tx, user, projected);
  await tx.run(`DELETE FROM workout_history_dirty WHERE ${owned}`, [user, ...ids]);
  return { sessions: ids.length, results: projected.length };
}

// Each batch commits with its invalidation removal. A failed batch remains dirty and retryable.
export async function refreshHistoryIndex(db: Database, user: string) {
  const total = { sessions: 0, results: 0 };
  for (;;) {
    const batch = await db.transaction((tx) => refreshBatch(tx, user));
    total.sessions += batch.sessions;
    total.results += batch.results;
    if (!batch.sessions) return total;
  }
}

export async function rebuildHistoryIndex(db: Database, user: string) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM workout_history_index WHERE user_id = ?', [user]);
    await tx.run(
      `INSERT INTO workout_history_dirty (user_id, session_id)
      SELECT user_id, id FROM workout_sessions WHERE user_id = ? AND status = 'completed' AND deleted_at IS NULL
      ON CONFLICT (user_id, session_id) DO NOTHING`,
      [user],
    );
  });
  return refreshHistoryIndex(db, user);
}
