import type { Database, Sql, SqlValue } from '../../lib/db/database';
import { projectPerformedHistory, type ExerciseHistoryRow } from './historyProjection';
import { structureFromRows } from './structureReads';
import { ITEM_COLUMNS, RESULT_COLUMNS, type ItemRow, type ResultRow } from './structureRows';
import { readSession, SESSION_COLUMNS, type SessionRow } from './workouts';

function groupBySession<T extends { sessionId: string }>(rows: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.sessionId) ?? [];
    group.push(row);
    groups.set(row.sessionId, group);
  }
  return groups;
}
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

async function refreshBatch(tx: Sql, user: string, exercises?: readonly string[]) {
  if (exercises?.length === 0) return { sessions: 0, results: 0 };
  const dirty = await tx.all<{ session_id: string }>(
    exercises
      ? `SELECT DISTINCT d.session_id FROM workout_history_catalog c
         JOIN workout_history_dirty d ON d.user_id = c.user_id AND d.session_id = c.session_id
         WHERE c.user_id = ? AND c.exercise_id IN (${placeholders(exercises.length)}) ORDER BY d.session_id LIMIT 25`
      : 'SELECT session_id FROM workout_history_dirty WHERE user_id = ? ORDER BY session_id LIMIT 25',
    exercises ? [user, ...exercises] : [user],
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
  let resultGroups = new Map<string, ResultRow[]>();
  let itemGroups = new Map<string, ItemRow[]>();
  if (completedIds.length) {
    const stored = await tx.all<ResultRow>(
      `SELECT ${RESULT_COLUMNS} FROM set_logs WHERE user_id = ? AND session_id IN (${placeholders(completedIds.length)})`,
      [user, ...completedIds],
    );
    resultGroups = groupBySession(stored);
    itemGroups = groupBySession(
      await tx.all<ItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM session_items WHERE user_id = ? AND session_id IN (${placeholders(completedIds.length)})`,
        [user, ...completedIds],
      ),
    );
  }
  const projected = sessions.flatMap((session) => {
    const { resultView } = structureFromRows(
      session,
      itemGroups.get(session.id) ?? [],
      resultGroups.get(session.id) ?? [],
    );
    return projectPerformedHistory(session, resultView.results);
  });
  await writeRows(tx, user, projected);
  await tx.run(
    `DELETE FROM workout_history_catalog WHERE ${owned}
    AND NOT EXISTS (SELECT 1 FROM workout_sessions s WHERE s.user_id = workout_history_catalog.user_id AND s.id = workout_history_catalog.session_id)`,
    [user, ...ids],
  );
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

// Check the dirty queue and read comparisons inside one transaction, without a sync/write gap.
export async function withFreshHistory<C, T>(
  db: Database,
  user: string,
  prepare: (tx: Sql) => Promise<{ context: C; exercises: readonly string[] }>,
  read: (tx: Sql, context: C) => Promise<T>,
): Promise<T> {
  for (;;) {
    const step = await db.transaction(async (tx) => {
      const { context, exercises } = await prepare(tx);
      const batch = await refreshBatch(tx, user, exercises);
      if (batch.sessions) return { ready: false as const };
      return { ready: true as const, value: await read(tx, context) };
    });
    if (step.ready) return step.value;
  }
}
