import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { GoogleVerifier } from '../auth/google.js';
import { loadConfig } from '../config.js';
import { unauthorized } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { openTestDatabase, resetTables } from '../test/db.js';

// Custom exercises and favourites ride the same sync protocol as weigh-ins (covered in
// sync.test.ts); these tests check their own validation and round trip.

const database = openTestDatabase();
const rejectGoogle: GoogleVerifier = async () => {
  throw unauthorized('GOOGLE_TOKEN_INVALID', 'not used here');
};
const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 's'.repeat(40), AUTH_DEV_LOGIN: 'true' });
const app = createApp(config, createLogger(config), { db: database.db, verifyGoogle: rejectGoogle, now: () => new Date('2026-10-07T10:00:00Z') });

async function signIn() {
  const res = await request(app).post('/auth/dev').send({ email: 'peter@example.com' });
  return res.body.session.accessToken as string;
}

const exercise = (overrides: Record<string, unknown> = {}) => ({
  id: '5f0e4b7a-3c2d-4e1f-9a8b-7c6d5e4f3a2b',
  updatedAt: '2026-10-07T09:00:00.000Z',
  deletedAt: null,
  name: 'Sandbag Carry',
  category: 'strongman',
  equipment: 'other',
  primaryMuscles: ['traps', 'forearms'],
  secondaryMuscles: ['abdominals'],
  tracking: 'distance_time',
  instructions: 'Hug the bag high on your chest and walk.',
  photoId: '9d1c7a8e-5b2f-4c3d-8e1f-2a3b4c5d6e7f',
  ...overrides,
});

const favourite = (exerciseId: string, overrides: Record<string, unknown> = {}) => ({
  id: '7e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b',
  updatedAt: '2026-10-07T09:00:00.000Z',
  deletedAt: null,
  exerciseId,
  ...overrides,
});

beforeEach(() => resetTables(database));
afterAll(() => database.close());

describe('custom exercises and favourites', () => {
  it('round-trips a custom exercise and a favourite, arrays included', async () => {
    const token = await signIn();
    const push = await request(app)
      .post('/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ changes: { custom_exercises: [exercise()], exercise_favourites: [favourite('Barbell_Squat')] } });
    expect(push.body).toMatchObject({ applied: [exercise().id, favourite('x').id], rejected: [] });

    const pull = await request(app).get('/sync/pull').set('Authorization', `Bearer ${token}`);
    expect(pull.body.changes.custom_exercises).toEqual([exercise()]);
    expect(pull.body.changes.exercise_favourites).toEqual([favourite('Barbell_Squat')]);
  });

  it('rejects custom exercises outside the vocabulary', async () => {
    const token = await signIn();
    const bad = [
      exercise({ id: '00000000-0000-4000-8000-000000000001', name: '  ' }),
      exercise({ id: '00000000-0000-4000-8000-000000000002', category: 'yoga' }),
      exercise({ id: '00000000-0000-4000-8000-000000000003', primaryMuscles: [] }),
      exercise({ id: '00000000-0000-4000-8000-000000000004', primaryMuscles: ['wings'] }),
      exercise({ id: '00000000-0000-4000-8000-000000000005', tracking: 'vibes' }),
      favourite('../../etc/passwd', { id: '00000000-0000-4000-8000-000000000006' }),
    ];
    const res = await request(app)
      .post('/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ changes: { custom_exercises: bad.slice(0, 5), exercise_favourites: bad.slice(5) } });
    expect(res.body.applied).toEqual([]);
    expect(res.body.rejected.map((r: { id: string }) => r.id)).toEqual(bad.map((b) => b.id));
  });
});
