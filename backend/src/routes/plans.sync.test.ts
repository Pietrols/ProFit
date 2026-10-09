import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { GoogleVerifier } from '../auth/google.js';
import { loadConfig } from '../config.js';
import { unauthorized } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { openTestDatabase, resetTables } from '../test/db.js';
const database = openTestDatabase();
const rejectGoogle: GoogleVerifier = async () => { throw unauthorized('GOOGLE_TOKEN_INVALID', 'not used'); };
const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 's'.repeat(40), AUTH_DEV_LOGIN: 'true' });
const app = createApp(config, createLogger(config), { db: database.db, verifyGoogle: rejectGoogle, now: () => new Date('2026-10-08T10:00:00Z') });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sync = (n: number) => ({ id: id(n), updatedAt: '2026-10-08T09:00:00.000Z', deletedAt: null });
const records = () => ({
  plans: [{ ...sync(1), name: 'Full body', shape: 'cycle', difficulty: 'standard', active: true }],
  plan_days: [{ ...sync(2), planId: id(1), position: 0, weekday: null, name: 'Day A', restDay: false }],
  plan_exercises: [{ ...sync(3), dayId: id(2), exerciseId: 'Barbell_Squat', position: 0, sets: 3, targetReps: 8, targetTimeSeconds: null, targetDistanceMetres: null, restSeconds: 90, logFields: ['reps', 'weight', 'RPE', 'notes'] }],
  daily_habit: [{ ...sync(4), exerciseIds: ['Plank', 'Barbell_Squat'] }],
});
async function signIn(email = 'peter@example.com') { return (await request(app).post('/auth/dev').send({ email })).body.session.accessToken as string; }
const push = (token: string, changes: unknown) => request(app).post('/sync/push').set('Authorization', `Bearer ${token}`).send({ changes });
const pull = (token: string) => request(app).get('/sync/pull').set('Authorization', `Bearer ${token}`);
beforeEach(() => resetTables(database));
afterAll(() => database.close());
describe('plans sync', () => {
  it('round trips every collection and retrying is idempotent', async () => {
    const token = await signIn();
    const result = await push(token, records());
    expect(result.status).toBe(200);
    expect(result.body.rejected).toEqual([]);
    expect(result.body.applied).toHaveLength(4);
    expect((await pull(token)).body.changes).toMatchObject(records());
    expect((await push(token, records())).body.ignored).toHaveLength(4);
  });
  it('rejects invalid rows without blocking valid ones', async () => {
    const token = await signIn(); const r = records();
    const result = await push(token, {
      plans: [r.plans[0], { ...r.plans[0], id: id(5), difficulty: 'extreme' }],
      plan_days: [{ ...r.plan_days[0], weekday: 8 }],
      plan_exercises: [{ ...r.plan_exercises[0], sets: 0 }, { ...r.plan_exercises[0], id: id(6), logFields: ['reps', 'reps'] }],
      daily_habit: [{ ...r.daily_habit[0], exerciseIds: ['../../file'] }],
    });
    expect(result.body.applied).toEqual([id(1)]); expect(result.body.rejected).toHaveLength(5);
  });
  it('round trips tombstones and ignores older writes', async () => {
    const token = await signIn(); await push(token, records());
    const deleted = Object.fromEntries(Object.entries(records()).map(([key, rows]) => [key, rows.map((row) => ({ ...row, updatedAt: '2026-10-08T09:30:00.000Z', deletedAt: '2026-10-08T09:30:00.000Z' }))]));
    expect((await push(token, deleted)).body.applied).toHaveLength(4);
    expect((await push(token, records())).body.ignored).toHaveLength(4);
    expect((await pull(token)).body.changes).toMatchObject(deleted);
  });
  it('isolates users and prevents ownership theft', async () => {
    const a = await signIn(); const b = await signIn('other@example.com'); await push(a, records());
    const newer = Object.fromEntries(Object.entries(records()).map(([key, rows]) => [key, rows.map((row) => ({ ...row, updatedAt: '2026-10-08T09:45:00.000Z' }))]));
    expect((await push(b, newer)).body.ignored).toHaveLength(4);
    const result = await pull(b);
    for (const key of Object.keys(records())) expect(result.body.changes[key]).toEqual([]);
    expect((await pull(a)).body.changes).toMatchObject(records());
  });
  it('accepts children arriving first and pages across all collections', async () => {
    const token = await signIn(); const r = records();
    expect((await push(token, { plan_exercises: r.plan_exercises })).body.applied).toEqual([id(3)]);
    await push(token, { plans: r.plans, plan_days: r.plan_days, daily_habit: r.daily_habit });
    let cursor = 0; const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const page = await request(app).get(`/sync/pull?since=${cursor}&limit=1`).set('Authorization', `Bearer ${token}`);
      const rows = Object.values(page.body.changes).flat() as { id: string }[];
      expect(rows).toHaveLength(1); seen.push(rows[0]!.id); cursor = page.body.cursor;
      expect(page.body.hasMore).toBe(i < 3);
    }
    expect(new Set(seen).size).toBe(4);
  });
});
