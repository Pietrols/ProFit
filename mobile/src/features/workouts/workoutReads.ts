import type { Sql, SqlValue } from '../../lib/db/database';
import { timeSqlV1 } from '../../lib/db/timeSql';
import { validTime, validUuid } from './model';
import type { WorkoutSession } from './types';
import { readSession, SESSION_COLUMNS, type SessionRow } from './workouts';

export const WORKOUT_PAGE_SIZE = 25;
export type WorkoutCursor = { startedAt: string; id: string };
export type WorkoutPage = { sessions: WorkoutSession[]; next: WorkoutCursor | null };
export type WorkoutOverview = {
  active: WorkoutSession[];
  hasMoreActive: boolean;
  latestCompletion: WorkoutSession | null;
};
export type WorkoutHistoryFilters = {
  status?: 'all' | 'saved' | 'completed' | 'abandoned' | 'rest';
  planId?: string | null;
  exerciseId?: string | null;
  planName?: string;
  exerciseName?: string;
};

function historyFilter(filters: WorkoutHistoryFilters) {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  const status = filters.status ?? 'all';
  if (!['all', 'saved', 'completed', 'abandoned', 'rest'].includes(status))
    throw new Error('Choose a valid history status.');
  if (status === 'saved' || status === 'rest') clauses.push("status IN ('completed', 'abandoned')");
  if (status === 'rest') clauses.push("json_extract(snapshot, '$.restDay') = 1");
  if (status === 'completed' || status === 'abandoned') {
    clauses.push('status = ?');
    params.push(status);
  }
  if (filters.planId) {
    if (!validUuid(filters.planId)) throw new Error('Choose a valid plan filter.');
    clauses.push('plan_id = ?');
    params.push(filters.planId);
  }
  for (const text of [filters.planName, filters.exerciseName, filters.exerciseId]) {
    if (text !== undefined && text !== null && (typeof text !== 'string' || text.length > 200))
      throw new Error('Keep history filters under 200 characters.');
  }
  const contains = (text: string) => `%${text.trim().replace(/[\\%_]/g, '\\$&')}%`;
  if (filters.planName?.trim()) {
    clauses.push("json_extract(snapshot, '$.planName') LIKE ? ESCAPE '\\'");
    params.push(contains(filters.planName));
  }
  const exercise = filters.exerciseId || filters.exerciseName?.trim();
  if (exercise) {
    const key = filters.exerciseId ? 'exerciseId' : 'name';
    const match = filters.exerciseId ? '= ?' : "LIKE ? ESCAPE '\\'";
    const value = filters.exerciseId ? exercise : contains(exercise);
    clauses.push(`(EXISTS (SELECT 1 FROM json_each(workout_sessions.snapshot, '$.exercises') e
      WHERE json_extract(e.value, '$.${key}') ${match}) OR EXISTS (
      SELECT 1 FROM session_items i WHERE i.user_id = workout_sessions.user_id
      AND i.session_id = workout_sessions.id AND json_extract(i.exercise, '$.${key}') ${match}))`);
    params.push(value, value);
  }
  return { sql: clauses.length ? `AND ${clauses.join(' AND ')}` : '', params };
}

const started = timeSqlV1('started_at');
const ended = timeSqlV1('ended_at');

export async function readWorkoutOverview(
  db: Sql,
  user: string,
  planId: string | null,
): Promise<WorkoutOverview> {
  const active = await db.all<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM workout_sessions
     WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL
     ORDER BY ${started} DESC, id LIMIT ?`,
    [user, WORKOUT_PAGE_SIZE + 1],
  );
  const completed = planId
    ? await db.first<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM workout_sessions
         WHERE user_id = ? AND plan_id = ? AND status = 'completed' AND deleted_at IS NULL
         ORDER BY ${ended} DESC, id LIMIT 1`,
        [user, planId],
      )
    : null;
  return {
    active: active.slice(0, WORKOUT_PAGE_SIZE).map(readSession),
    hasMoreActive: active.length > WORKOUT_PAGE_SIZE,
    latestCompletion: completed ? readSession(completed) : null,
  };
}

export async function readWorkoutPage(
  db: Sql,
  user: string,
  cursor: WorkoutCursor | null = null,
  filters: WorkoutHistoryFilters = {},
): Promise<WorkoutPage> {
  if (
    cursor &&
    (!validTime(cursor.startedAt) ||
      typeof cursor.id !== 'string' ||
      !cursor.id ||
      cursor.id.length > 100)
  )
    throw new Error('This workout history page is invalid. Open history again.');
  const filter = historyFilter(filters);
  const instant = cursor ? Date.parse(cursor.startedAt) : null;
  const continuation = cursor ? `AND ${started} <= ? AND (${started} < ? OR id > ?)` : '';
  const rows = await db.all<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM workout_sessions
     WHERE user_id = ? AND deleted_at IS NULL ${continuation} ${filter.sql}
     ORDER BY ${started} DESC, id LIMIT ?`,
    cursor
      ? [user, instant, instant, cursor.id, ...filter.params, WORKOUT_PAGE_SIZE + 1]
      : [user, ...filter.params, WORKOUT_PAGE_SIZE + 1],
  );
  const sessions = rows.slice(0, WORKOUT_PAGE_SIZE).map(readSession);
  const last = sessions.at(-1);
  return {
    sessions,
    next:
      rows.length > WORKOUT_PAGE_SIZE && last ? { startedAt: last.startedAt, id: last.id } : null,
  };
}
