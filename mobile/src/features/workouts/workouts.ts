import type { Database, Sql } from '../../lib/db/database';
import { randomId } from '../../lib/randomId';
import { uuidv5 } from '../../lib/uuid';
import { sessionInput, setInput, validateSession, validateSet } from './model';
import type { SessionInput, SetInput, SetLog, WorkoutSession } from './types';

const SESSION_COLUMNS = `id, plan_id AS planId, day_id AS dayId, local_date AS localDate,
  started_at AS startedAt, ended_at AS endedAt, status, notes, easier_today AS easierToday,
  snapshot, updated_at AS updatedAt`;
type SessionRow = Omit<WorkoutSession, 'snapshot' | 'easierToday'> & { snapshot: string; easierToday: number };
function readSession(row: SessionRow): WorkoutSession {
  const result = { ...row, snapshot: JSON.parse(row.snapshot) as WorkoutSession['snapshot'], easierToday: !!row.easierToday };
  check(validateSession(sessionInput(result)));
  return result;
}
function check(error: string | null) { if (error) throw new Error(error); }
export async function getSession(db: Sql, userId: string, id: string): Promise<WorkoutSession | null> {
  const row = await db.first<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [id, userId]);
  return row ? readSession(row) : null;
}
export async function listSessions(db: Sql, userId: string): Promise<WorkoutSession[]> {
  const rows = await db.all<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL ORDER BY started_at DESC, id`, [userId]);
  return rows.map(readSession);
}
async function requireSession(db: Sql, userId: string, id: string) {
  const session = await getSession(db, userId, id);
  if (!session) throw new Error('This session is no longer available.');
  return session;
}

export async function startSession(db: Database, userId: string, input: Pick<SessionInput, 'planId' | 'dayId' | 'localDate' | 'snapshot'>, now: Date, id = randomId()): Promise<string> {
  const session: SessionInput = { ...input, startedAt: now.toISOString(), endedAt: null, status: 'active', notes: '', easierToday: false };
  check(validateSession(session));
  await db.transaction(async (tx) => {
    const existing = await tx.first<{ user_id: string; deleted_at: string | null }>('SELECT user_id, deleted_at FROM workout_sessions WHERE id = ?', [id]);
    if (existing) {
      if (existing.user_id !== userId || existing.deleted_at) throw new Error('This session is no longer available.');
      return; // A retry keeps the original snapshot and start time.
    }
    const parent = await tx.first(`SELECT d.id FROM plan_days d JOIN plans p ON p.id = d.plan_id AND p.user_id = d.user_id
      WHERE d.id = ? AND p.id = ? AND d.user_id = ? AND d.deleted_at IS NULL AND p.deleted_at IS NULL`, [input.dayId, input.planId, userId]);
    if (!parent) throw new Error('Choose a day that is still available.');
    if (await tx.first("SELECT id FROM workout_sessions WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL", [userId])) throw new Error('Resume or finish your active session first.');
    await tx.run(`INSERT INTO workout_sessions (id, user_id, plan_id, day_id, local_date, started_at, ended_at, status, notes, easier_today, snapshot, updated_at, deleted_at, dirty)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', '', 0, ?, ?, NULL, 1)`,
    [id, userId, input.planId, input.dayId, input.localDate, session.startedAt, JSON.stringify(input.snapshot), now.toISOString()]);
  });
  return id;
}
export async function updateSession(db: Database, userId: string, id: string, patch: Pick<SessionInput, 'notes' | 'easierToday'>, now: Date) {
  await db.transaction(async (tx) => {
    const session = await requireSession(tx, userId, id);
    check(validateSession({ ...sessionInput(session), ...patch }));
    await tx.run('UPDATE workout_sessions SET notes = ?, easier_today = ?, updated_at = ?, dirty = 1 WHERE id = ? AND user_id = ?', [patch.notes, patch.easierToday ? 1 : 0, now.toISOString(), id, userId]);
  });
}
export async function finishSession(db: Database, userId: string, id: string, status: 'completed' | 'abandoned', now: Date) {
  await db.transaction(async (tx) => {
    const session = await requireSession(tx, userId, id);
    if (session.status === status) return;
    if (session.status !== 'active') throw new Error('This session has already ended.');
    const endedAt = now.toISOString();
    check(validateSession({ ...sessionInput(session), status, endedAt }));
    const logs = await listSets(tx, userId, id);
    if (logs.some((set) => Date.parse(set.loggedAt) > now.getTime())) throw new Error('The end time must follow your logged sets.');
    await tx.run('UPDATE workout_sessions SET status = ?, ended_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND user_id = ?', [status, endedAt, endedAt, id, userId]);
  });
}

// A slot has one id across retries and devices; repeated exercise ids still have distinct slots.
export const setLogId = (sessionId: string, exercisePosition: number, setIndex: number) => uuidv5(`${exercisePosition}:${setIndex}`, sessionId);
export async function saveSet(db: Database, userId: string, input: SetInput, now: Date): Promise<string> {
  check(validateSet(input));
  const id = setLogId(input.sessionId, input.exercisePosition, input.setIndex);
  await db.transaction(async (tx) => {
    const session = await requireSession(tx, userId, input.sessionId);
    check(validateSet(input, session.snapshot));
    if (session.status === 'abandoned') throw new Error('This session was abandoned.');
    if (Date.parse(input.loggedAt) < Date.parse(session.startedAt) || session.endedAt !== null && Date.parse(input.loggedAt) > Date.parse(session.endedAt)) throw new Error('Log the set within the session times.');
    const result = await tx.run(`INSERT INTO set_logs (id, user_id, session_id, exercise_position, set_index, logged_at, log_fields, values_json, updated_at, deleted_at, dirty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)
      ON CONFLICT(id) DO UPDATE SET logged_at = excluded.logged_at, log_fields = excluded.log_fields,
        values_json = excluded.values_json, updated_at = excluded.updated_at, deleted_at = NULL, dirty = 1
      WHERE set_logs.user_id = excluded.user_id AND set_logs.session_id = excluded.session_id`,
    [id, userId, input.sessionId, input.exercisePosition, input.setIndex, input.loggedAt, JSON.stringify(input.logFields), JSON.stringify(input.values), now.toISOString()]);
    if (!result.changes) throw new Error('This set is no longer available.');
  });
  return id;
}
export async function listSets(db: Sql, userId: string, sessionId: string): Promise<SetLog[]> {
  const session = await getSession(db, userId, sessionId);
  if (!session) return [];
  const rows = await db.all<Omit<SetLog, 'logFields' | 'values'> & { logFields: string; values: string }>(`SELECT id, session_id AS sessionId, exercise_position AS exercisePosition,
    set_index AS setIndex, logged_at AS loggedAt, log_fields AS logFields, values_json AS [values], updated_at AS updatedAt
    FROM set_logs WHERE session_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY exercise_position, set_index`, [sessionId, userId]);
  return rows.flatMap((row) => {
    const set: SetLog = { ...row, logFields: JSON.parse(row.logFields) as SetLog['logFields'], values: JSON.parse(row.values) as SetLog['values'] };
    // Soft links can arrive before parents. Invalid slots never become visible workout results.
    if (validateSet(setInput(set), session.snapshot) || set.id !== setLogId(sessionId, set.exercisePosition, set.setIndex) ||
      Date.parse(set.loggedAt) < Date.parse(session.startedAt) || session.endedAt && Date.parse(set.loggedAt) > Date.parse(session.endedAt)) return [];
    return [set];
  });
}
export async function deleteSet(db: Sql, userId: string, id: string, now: Date) {
  await db.run('UPDATE set_logs SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [now.toISOString(), now.toISOString(), id, userId]);
}
export async function deleteSession(db: Database, userId: string, id: string, now: Date) {
  await db.transaction(async (tx) => {
    const at = now.toISOString();
    await tx.run('UPDATE set_logs SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE session_id = ? AND user_id = ? AND deleted_at IS NULL', [at, at, id, userId]);
    await tx.run('UPDATE workout_sessions SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [at, at, id, userId]);
  });
}
