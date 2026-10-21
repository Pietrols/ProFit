import type { Sql } from '../../lib/db/database';
import { sessionInput, validateSession } from './model';
import type { WorkoutSession } from './types';

export const SESSION_COLUMNS = `id, plan_id AS planId, day_id AS dayId, local_date AS localDate,
  started_at AS startedAt, ended_at AS endedAt, status, notes, easier_today AS easierToday,
  snapshot, updated_at AS updatedAt`;
export type SessionRow = Omit<WorkoutSession, 'snapshot' | 'easierToday'> & {
  snapshot: string;
  easierToday: number;
};

export function readSession(row: SessionRow): WorkoutSession {
  const result = {
    ...row,
    snapshot: JSON.parse(row.snapshot) as WorkoutSession['snapshot'],
    easierToday: !!row.easierToday,
  };
  const error = validateSession(sessionInput(result));
  if (error) throw new Error(error);
  return result;
}

export async function getSession(
  db: Sql,
  userId: string,
  id: string,
): Promise<WorkoutSession | null> {
  const row = await db.first<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId],
  );
  return row ? readSession(row) : null;
}
