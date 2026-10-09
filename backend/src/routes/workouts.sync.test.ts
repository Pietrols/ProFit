import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { GoogleVerifier } from '../auth/google.js';
import { loadConfig } from '../config.js';
import { unauthorized } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { openTestDatabase, resetTables } from '../test/db.js';
import { setLogRecord, workoutSessionRecord } from '../sync/collections.js';

const database = openTestDatabase();
const rejectGoogle: GoogleVerifier = async () => { throw unauthorized('GOOGLE_TOKEN_INVALID', 'not used'); };
const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 's'.repeat(40), AUTH_DEV_LOGIN: 'true' });
const app = createApp(config, createLogger(config), { db: database.db, verifyGoogle: rejectGoogle, now: () => new Date('2026-10-09T10:00:00Z') });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (n: number) => new Date(Date.UTC(2026, 9, 9, 9, n)).toISOString();
const sync = (n: number) => ({ id: id(n), updatedAt: at(5), deletedAt: null });
const snapshot = {
  planName: 'My cycle', dayName: 'Push', difficulty: 'standard', restDay: false,
  exercises: [{ exerciseId: 'Barbell_Bench_Press', name: 'Bench press', sets: 3, targetReps: 8,
    targetTimeSeconds: null, targetDistanceMetres: null, restSeconds: 60, logFields: ['reps', 'weight', 'RPE', 'notes'] }],
};
const session = () => ({ ...sync(1), planId: id(10), dayId: id(11), localDate: '2026-10-09',
  startedAt: at(0), endedAt: null, status: 'active', notes: '', easierToday: false, snapshot });
const set = () => ({ ...sync(2), sessionId: id(1), exercisePosition: 0, setIndex: 0,
  loggedAt: at(1), logFields: ['reps', 'weight', 'RPE', 'notes'], values: { reps: 8, weight: 45, RPE: 7.5, notes: 'Smooth' } });
async function signIn(email = 'workout@example.com') { return (await request(app).post('/auth/dev').send({ email })).body.session.accessToken as string; }
const push = (token: string, changes: unknown) => request(app).post('/sync/push').set('Authorization', `Bearer ${token}`).send({ changes });
const pull = (token: string, since = 0, limit = 500) => request(app).get('/sync/pull').query({ since, limit }).set('Authorization', `Bearer ${token}`);
beforeEach(() => resetTables(database));
afterAll(() => database.close());

describe('workout sync', () => {
  it('round trips snapshots, selected values, completed state and retries', async () => {
    const token = await signIn();
    const changes = { workout_sessions: [session()], set_logs: [set()] };
    expect((await push(token, changes)).body).toEqual({ applied: [id(1), id(2)], ignored: [], rejected: [] });
    expect((await pull(token)).body.changes).toMatchObject(changes);
    expect((await push(token, changes)).body.ignored).toHaveLength(2);
    const completed = { ...session(), status: 'completed', endedAt: at(20), notes: 'Good session', easierToday: true, updatedAt: at(20) };
    expect((await push(token, { workout_sessions: [completed] })).body.applied).toEqual([id(1)]);
    expect((await pull(token)).body.changes.workout_sessions).toEqual([completed]);
  });
  it('isolates users and prevents ownership theft even with newer timestamps', async () => {
    const a = await signIn(); const b = await signIn('other@example.com');
    await push(a, { workout_sessions: [session()], set_logs: [set()] });
    const theft = { workout_sessions: [{ ...session(), updatedAt: at(30) }], set_logs: [{ ...set(), updatedAt: at(30) }] };
    expect((await push(b, theft)).body.ignored).toHaveLength(2);
    const empty = (await pull(b)).body.changes;
    expect(empty.workout_sessions).toEqual([]); expect(empty.set_logs).toEqual([]);
    // A foreign soft link only returns the caller's own row, never its foreign parent.
    expect((await push(b, { set_logs: [{ ...set(), id: id(3) }] })).body.applied).toEqual([id(3)]);
    expect((await pull(b)).body.changes.workout_sessions).toEqual([]);
    expect((await pull(a)).body.changes.set_logs).toHaveLength(1);
  });
  it('rejects bad selected values without blocking valid rows', async () => {
    const token = await signIn();
    const result = await push(token, { workout_sessions: [session()], set_logs: [
      set(), { ...set(), id: id(3), logFields: ['reps'], values: { reps: 8, weight: 20 } },
      { ...set(), id: id(4), values: { reps: -1 } }, { ...set(), id: id(5), values: { extra: 1 } },
      { ...set(), id: id(6), values: {} }, { ...set(), id: id(7), logFields: ['reps', 'reps'] },
    ] });
    expect(result.body.applied).toEqual([id(1), id(2)]); expect(result.body.rejected).toHaveLength(5);
  });
  it('accepts children first and uses one paginated cursor for both collections', async () => {
    const token = await signIn();
    expect((await push(token, { set_logs: [set()] })).body.applied).toEqual([id(2)]);
    await push(token, { workout_sessions: [session()] });
    const first = (await pull(token, 0, 1)).body;
    expect(first.changes.set_logs).toEqual([set()]); expect(first.hasMore).toBe(true);
    const second = (await pull(token, first.cursor, 1)).body;
    expect(second.changes.workout_sessions).toEqual([session()]); expect(second.hasMore).toBe(false);
    expect(second.cursor).toBeGreaterThan(first.cursor);
  });
  it('syncs tombstones and ignores stale attempts to revive them', async () => {
    const token = await signIn();
    await push(token, { workout_sessions: [session()], set_logs: [set()] });
    const deadSession = { ...session(), deletedAt: at(20), updatedAt: at(20) };
    const deadSet = { ...set(), deletedAt: at(20), updatedAt: at(20) };
    await push(token, { workout_sessions: [deadSession], set_logs: [deadSet] });
    expect((await push(token, { workout_sessions: [session()], set_logs: [set()] })).body.ignored).toHaveLength(2);
    expect((await pull(token)).body.changes).toMatchObject({ workout_sessions: [deadSession], set_logs: [deadSet] });
  });
});

describe('workout wire validation', () => {
  it.each([
    { localDate: '2026-02-30' }, { startedAt: 'yesterday' }, { status: 'finished' }, { endedAt: at(2) },
    { status: 'completed', endedAt: null }, { status: 'completed', endedAt: '2026-10-08T09:00:00.000Z' },
    { snapshot: { ...snapshot, exercises: [] } }, { snapshot: { ...snapshot, restDay: true } },
    { snapshot: { ...snapshot, exercises: Array(101).fill(snapshot.exercises[0]) } }, { notes: 'x'.repeat(2001) },
  ])('rejects invalid session %j', (patch) => {
    expect(workoutSessionRecord.safeParse({ ...session(), ...patch }).success).toBe(false);
  });
  it.each([
    { values: { reps: 1.5 } }, { values: { weight: Infinity } }, { values: { RPE: 11 } },
    { values: { notes: 'x'.repeat(2001) } }, { values: { reps: null } }, { exercisePosition: 100 }, { setIndex: -1 },
    { values: { done: false }, logFields: ['done'] }, { values: { notes: ' ' }, logFields: ['notes'] },
  ])('rejects invalid set %j', (patch) => {
    expect(setLogRecord.safeParse({ ...set(), ...patch }).success).toBe(false);
  });
  it('accepts rest sessions, zero values, notes-only and done-only logs', () => {
    expect(workoutSessionRecord.safeParse({ ...session(), snapshot: { ...snapshot, restDay: true, exercises: [] } }).success).toBe(true);
    for (const patch of [
      { logFields: ['reps', 'weight'], values: { reps: 0, weight: 0 } },
      { logFields: ['notes'], values: { notes: 'Mobility complete' } },
      { logFields: ['done'], values: { done: true } },
    ]) expect(setLogRecord.safeParse({ ...set(), ...patch }).success).toBe(true);
  });
});
