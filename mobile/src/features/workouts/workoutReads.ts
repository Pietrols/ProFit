import type { Sql } from '../../lib/db/database';
import { timeSqlV1 } from '../../lib/db/timeSql';
import { validTime } from './model';
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
): Promise<WorkoutPage> {
  if (
    cursor &&
    (!validTime(cursor.startedAt) ||
      typeof cursor.id !== 'string' ||
      !cursor.id ||
      cursor.id.length > 100)
  )
    throw new Error('This workout history page is invalid. Open history again.');
  const instant = cursor ? Date.parse(cursor.startedAt) : null;
  const continuation = cursor ? `AND ${started} <= ? AND (${started} < ? OR id > ?)` : '';
  const rows = await db.all<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM workout_sessions
     WHERE user_id = ? AND deleted_at IS NULL ${continuation}
     ORDER BY ${started} DESC, id LIMIT ?`,
    cursor
      ? [user, instant, instant, cursor.id, WORKOUT_PAGE_SIZE + 1]
      : [user, WORKOUT_PAGE_SIZE + 1],
  );
  const sessions = rows.slice(0, WORKOUT_PAGE_SIZE).map(readSession);
  const last = sessions.at(-1);
  return {
    sessions,
    next:
      rows.length > WORKOUT_PAGE_SIZE && last ? { startedAt: last.startedAt, id: last.id } : null,
  };
}
