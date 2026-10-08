import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { GoogleVerifier } from '../auth/google.js';
import { loadConfig } from '../config.js';
import { unauthorized } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { openTestDatabase, resetTables } from '../test/db.js';

const database = openTestDatabase();
let clock = new Date('2026-10-07T08:00:00Z');
const now = () => clock;
const rejectGoogle: GoogleVerifier = async () => {
  throw unauthorized('GOOGLE_TOKEN_INVALID', 'not used here');
};

const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 's'.repeat(40), AUTH_DEV_LOGIN: 'true' });
const app = createApp(config, createLogger(config), { db: database.db, verifyGoogle: rejectGoogle, now });

async function signIn(email: string): Promise<string> {
  const res = await request(app).post('/auth/dev').send({ email });
  expect(res.status).toBe(200);
  return res.body.session.accessToken as string;
}

const ID_A = '0b9f3c2e-1d2a-4c5b-8e9f-0a1b2c3d4e5f';
const ID_B = '1c0a4d3f-2e3b-4d6c-9f0a-1b2c3d4e5f60';

const weight = (overrides: Record<string, unknown> = {}) => ({
  id: ID_A,
  date: '2026-10-07',
  weightKg: 81.4,
  note: null,
  updatedAt: '2026-10-07T07:59:00.000Z',
  deletedAt: null,
  ...overrides,
});

const pushAs = (token: string, records: unknown[]) =>
  request(app).post('/sync/push').set('Authorization', `Bearer ${token}`).send({ changes: { weight_entries: records } });
const pullAs = (token: string, since = 0, limit?: number) =>
  request(app)
    .get('/sync/pull')
    .query(limit ? { since, limit } : { since })
    .set('Authorization', `Bearer ${token}`);

beforeEach(async () => {
  clock = new Date('2026-10-07T08:00:00Z');
  await resetTables(database);
});
afterAll(() => database.close());

describe('sync', () => {
  it('needs a signed-in user', async () => {
    expect((await request(app).get('/sync/pull')).status).toBe(401);
    expect((await request(app).post('/sync/push').send({ changes: {} })).status).toBe(401);
  });

  it('stores a pushed record and returns it on pull', async () => {
    const token = await signIn('peter@example.com');
    const pushed = await pushAs(token, [weight()]);
    expect(pushed.status).toBe(200);
    expect(pushed.body).toEqual({ applied: [ID_A], ignored: [], rejected: [] });

    const pulled = await pullAs(token);
    expect(pulled.status).toBe(200);
    expect(pulled.body.changes.weight_entries).toEqual([weight()]);
    expect(pulled.body.cursor).toBeGreaterThan(0);
    expect(pulled.body.hasMore).toBe(false);
  });

  it('keeps one row when the same record is sent twice', async () => {
    const token = await signIn('peter@example.com');
    await pushAs(token, [weight()]);
    const again = await pushAs(token, [weight()]);
    expect(again.body).toEqual({ applied: [], ignored: [ID_A], rejected: [] });
    expect((await pullAs(token)).body.changes.weight_entries).toHaveLength(1);
  });

  it('lets the later edit win, whichever arrives first', async () => {
    const token = await signIn('peter@example.com');
    await pushAs(token, [weight({ weightKg: 82, updatedAt: '2026-10-07T07:50:00.000Z' })]);
    await pushAs(token, [weight({ weightKg: 81, updatedAt: '2026-10-07T07:55:00.000Z' })]);
    const stale = await pushAs(token, [weight({ weightKg: 99, updatedAt: '2026-10-07T07:40:00.000Z' })]);
    expect(stale.body.ignored).toEqual([ID_A]);
    expect((await pullAs(token)).body.changes.weight_entries[0].weightKg).toBe(81);
  });

  it('syncs a delete as a tombstone', async () => {
    const token = await signIn('peter@example.com');
    await pushAs(token, [weight()]);
    const first = await pullAs(token);
    await pushAs(token, [weight({ updatedAt: '2026-10-07T07:59:30.000Z', deletedAt: '2026-10-07T07:59:30.000Z' })]);
    const after = await pullAs(token, first.body.cursor);
    expect(after.body.changes.weight_entries).toEqual([weight({ updatedAt: '2026-10-07T07:59:30.000Z', deletedAt: '2026-10-07T07:59:30.000Z' })]);
  });

  it('reports invalid records without blocking the valid ones', async () => {
    const token = await signIn('peter@example.com');
    const res = await pushAs(token, [weight({ id: ID_B, weightKg: 5 }), weight({ id: 'not-a-uuid' }), weight({ date: '2026-02-30' }), weight({ id: ID_A, date: '2026-10-06' })]);
    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual([ID_A]);
    expect(res.body.rejected).toEqual([
      { collection: 'weight_entries', id: ID_B, reason: expect.stringContaining('weightKg') },
      { collection: 'weight_entries', id: 'not-a-uuid', reason: expect.stringContaining('id') },
      { collection: 'weight_entries', id: ID_A, reason: expect.stringContaining('real date') },
    ]);
  });

  it('caps edit times from a phone whose clock runs ahead', async () => {
    const token = await signIn('peter@example.com');
    await pushAs(token, [weight({ updatedAt: '2027-01-01T00:00:00.000Z' })]);
    const pulled = await pullAs(token);
    expect(pulled.body.changes.weight_entries[0].updatedAt).toBe('2026-10-07T08:05:00.000Z');
  });

  it("never touches another user's record or shows it to them", async () => {
    const peter = await signIn('peter@example.com');
    const mallory = await signIn('mallory@example.com');
    await pushAs(peter, [weight()]);

    const attempt = await pushAs(mallory, [weight({ weightKg: 300, updatedAt: '2026-10-07T07:59:59.000Z' })]);
    expect(attempt.body.ignored).toEqual([ID_A]);
    expect((await pullAs(mallory)).body.changes.weight_entries).toEqual([]);
    expect((await pullAs(peter)).body.changes.weight_entries[0].weightKg).toBe(81.4);
  });

  it('pages through changes in order and only sends what is new since the cursor', async () => {
    const token = await signIn('peter@example.com');
    const ids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005',
    ];
    await pushAs(
      token,
      ids.map((id, i) => weight({ id, date: `2026-10-0${i + 1}` })),
    );

    const seen: string[] = [];
    let cursor = 0;
    for (let page = 0; page < 5; page += 1) {
      const res = await pullAs(token, cursor, 2);
      seen.push(...res.body.changes.weight_entries.map((r: { id: string }) => r.id));
      cursor = res.body.cursor;
      if (!res.body.hasMore) break;
    }
    expect(seen).toEqual(ids);

    const nothingNew = await pullAs(token, cursor);
    expect(nothingNew.body).toEqual({ changes: { weight_entries: [], custom_exercises: [], exercise_favourites: [] }, cursor, hasMore: false });

    await pushAs(token, [weight({ id: ids[2], date: '2026-10-03', weightKg: 80, updatedAt: '2026-10-07T07:59:59.000Z' })]);
    const update = await pullAs(token, cursor);
    expect(update.body.changes.weight_entries.map((r: { id: string }) => r.id)).toEqual([ids[2]]);
  });

  it('refuses unknown collections and oversized batches', async () => {
    const token = await signIn('peter@example.com');
    const unknown = await request(app).post('/sync/push').set('Authorization', `Bearer ${token}`).send({ changes: { secrets: [] } });
    expect(unknown.status).toBe(400);
    const tooMany = await pushAs(token, Array.from({ length: 501 }, () => weight()));
    expect(tooMany.status).toBe(400);
    expect((await pullAs(token, 0, 1000)).status).toBe(400);
  });
});
