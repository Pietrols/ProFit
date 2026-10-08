import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { GoogleVerifier } from '../auth/google.js';
import { loadConfig } from '../config.js';
import { unauthorized } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { openTestDatabase, resetTables } from '../test/db.js';

const database = openTestDatabase();
let clock = new Date('2026-10-05T08:00:00Z');
const now = () => clock;

// Stands in for Google: "good-token" is Peter's account, anything else is rejected.
const fakeGoogle: GoogleVerifier = async (idToken) => {
  if (idToken !== 'good-token') throw unauthorized('GOOGLE_TOKEN_INVALID', 'Google sign-in could not be confirmed. Try again.');
  return { sub: 'google-123', email: 'peter@example.com', name: 'Peter', picture: null };
};

function appWith(env: NodeJS.ProcessEnv = {}) {
  const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 's'.repeat(40), ...env });
  return createApp(config, createLogger(config), { db: database.db, verifyGoogle: fakeGoogle, now });
}

const app = appWith();

async function signIn() {
  const res = await request(app).post('/auth/google').send({ idToken: 'good-token' });
  expect(res.status).toBe(200);
  return res.body as { session: { accessToken: string; refreshToken: string } };
}

beforeEach(async () => {
  clock = new Date('2026-10-05T08:00:00Z');
  await resetTables(database);
});
afterAll(() => database.close());

describe('POST /auth/google', () => {
  it('signs in and returns a session, the user and a pending profile', async () => {
    const res = await request(app).post('/auth/google').send({ idToken: 'good-token' });
    expect(res.status).toBe(200);
    expect(res.body.session).toEqual({
      accessToken: expect.any(String),
      accessTokenExpiresAt: '2026-10-05T08:15:00.000Z',
      refreshToken: expect.any(String),
    });
    expect(res.body.user).toEqual({ id: expect.any(String), email: 'peter@example.com', displayName: 'Peter', avatarUrl: null });
    expect(res.body.profile).toMatchObject({ onboardingStatus: 'pending', unitSystem: 'metric', goal: null });
    expect(res.body.user.googleSub).toBeUndefined();
  });

  it('passes on a rejected Google token as 401', async () => {
    const res = await request(app).post('/auth/google').send({ idToken: 'forged' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('GOOGLE_TOKEN_INVALID');
  });

  it('answers a missing token with a validation error', async () => {
    const res = await request(app).post('/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('POST /auth/dev', () => {
  it('does not exist unless developer sign-in is switched on', async () => {
    const res = await request(app).post('/auth/dev').send({ email: 'dev@example.com' });
    expect(res.status).toBe(404);
  });

  it('signs in any email when switched on', async () => {
    const res = await request(appWith({ AUTH_DEV_LOGIN: 'true' })).post('/auth/dev').send({ email: 'Tester@Example.com', name: 'Tester' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'tester@example.com', displayName: 'Tester' });
  });
});

describe('refresh and sign-out', () => {
  it('trades a refresh token for a new session', async () => {
    const { session } = await signIn();
    const res = await request(app).post('/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.session.refreshToken).not.toBe(session.refreshToken);
  });

  it('signs out so the refresh token stops working', async () => {
    const { session } = await signIn();
    expect((await request(app).post('/auth/sign-out').send({ refreshToken: session.refreshToken })).status).toBe(204);
    const res = await request(app).post('/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });
});

describe('GET /me', () => {
  it('needs a token', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('says TOKEN_EXPIRED once the access token is old, so the app refreshes', async () => {
    const { session } = await signIn();
    clock = new Date(clock.getTime() + 16 * 60 * 1000);
    const res = await request(app).get('/me').set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('returns the signed-in user and profile', async () => {
    const { session } = await signIn();
    const res = await request(app).get('/me').set('Authorization', `Bearer ${session.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('peter@example.com');
    expect(res.body.profile.onboardingStatus).toBe('pending');
  });
});

describe('PATCH /me', () => {
  async function patch(body: unknown) {
    const { session } = await signIn();
    return request(app).patch('/me').set('Authorization', `Bearer ${session.accessToken}`).send(body as object);
  }

  it('saves onboarding answers and marks onboarding completed', async () => {
    const res = await patch({ displayName: ' Peter K ', goal: 'bodybuilding', experience: 'intermediate', trainingPlace: 'gym', onboardingStatus: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Peter K');
    expect(res.body.profile).toMatchObject({ goal: 'bodybuilding', experience: 'intermediate', trainingPlace: 'gym', onboardingStatus: 'completed' });
  });

  it('records a skipped onboarding', async () => {
    const res = await patch({ onboardingStatus: 'skipped' });
    expect(res.body.profile.onboardingStatus).toBe('skipped');
  });

  it('clears an optional detail with null', async () => {
    const { session } = await signIn();
    const auth = { Authorization: `Bearer ${session.accessToken}` };
    await request(app).patch('/me').set(auth).send({ heightCm: 180 });
    const res = await request(app).patch('/me').set(auth).send({ heightCm: null });
    expect(res.body.profile.heightCm).toBeNull();
  });

  it.each([
    ['an unknown goal', { goal: 'getting huge' }],
    ['an empty name', { displayName: '   ' }],
    ['a birth year under 13 years ago', { birthYear: 2020 }],
    ['eight training days', { daysPerWeek: 8 }],
    ['resetting onboarding to pending', { onboardingStatus: 'pending' }],
    ['a field ProFit does not know', { favouriteColour: 'red' }],
    ['an empty change', {}],
  ])('rejects %s', async (_label, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
