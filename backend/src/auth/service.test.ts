import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { profiles, refreshTokens, users } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { openTestDatabase, resetTables } from '../test/db.js';
import { REFRESH_RETRY_GRACE_SECONDS, refreshSession, signInWithIdentity, signOut, type AuthContext } from './service.js';
import { verifyAccessToken } from './tokens.js';

const database = openTestDatabase();
const SECRET = 's'.repeat(40);
let clock = new Date('2026-10-05T08:00:00Z');
const ctx: AuthContext = { db: database.db, secret: SECRET, now: () => clock };
const peter = { sub: 'google-123', email: 'peter@example.com', name: 'Peter K', picture: 'https://example.com/a.jpg' };

const advance = (seconds: number) => {
  clock = new Date(clock.getTime() + seconds * 1000);
};

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err instanceof AppError ? err.code : 'NOT_APP_ERROR';
  }
}

beforeEach(async () => {
  clock = new Date('2026-10-05T08:00:00Z');
  await resetTables(database);
});
afterAll(() => database.close());

describe('signing in with a Google identity', () => {
  it('creates the user with a pending profile and a working session', async () => {
    const result = await signInWithIdentity(ctx, peter);
    expect(result.user).toMatchObject({ googleSub: 'google-123', email: 'peter@example.com', displayName: 'Peter K' });
    expect(result.profile.onboardingStatus).toBe('pending');
    expect(await verifyAccessToken(result.session.accessToken, SECRET, clock)).toBe(result.user.id);
  });

  it('signs the same person into the same account and keeps a name they edited', async () => {
    const first = await signInWithIdentity(ctx, peter);
    await database.db.update(users).set({ displayName: 'Pete' }).where(eq(users.id, first.user.id));
    const second = await signInWithIdentity(ctx, { ...peter, email: 'new-address@example.com' });
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.displayName).toBe('Pete');
    expect(second.user.email).toBe('new-address@example.com');
    expect(await database.db.select().from(profiles)).toHaveLength(1);
  });

  it('uses the start of the email as a name when Google gives none', async () => {
    const result = await signInWithIdentity(ctx, { ...peter, name: null });
    expect(result.user.displayName).toBe('peter');
  });

  it('never stores the refresh token itself', async () => {
    const { session } = await signInWithIdentity(ctx, peter);
    const rows = await database.db.select().from(refreshTokens);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(session.refreshToken);
  });
});

describe('refreshing a session', () => {
  it('returns a new pair and retires the old refresh token', async () => {
    const { session } = await signInWithIdentity(ctx, peter);
    advance(600);
    const next = await refreshSession(ctx, session.refreshToken);
    expect(next.refreshToken).not.toBe(session.refreshToken);
    expect(await refreshSession(ctx, next.refreshToken)).toBeTruthy();
  });

  it('treats the same token sent again within the grace window as a retry', async () => {
    const { session } = await signInWithIdentity(ctx, peter);
    await refreshSession(ctx, session.refreshToken);
    advance(REFRESH_RETRY_GRACE_SECONDS - 5);
    expect(await codeOf(refreshSession(ctx, session.refreshToken))).toBeUndefined();
  });

  it('revokes the whole sign-in when an old token is reused after the grace window', async () => {
    const { session } = await signInWithIdentity(ctx, peter);
    const next = await refreshSession(ctx, session.refreshToken);
    advance(REFRESH_RETRY_GRACE_SECONDS + 1);
    expect(await codeOf(refreshSession(ctx, session.refreshToken))).toBe('SESSION_EXPIRED');
    // The token the real owner holds now stops working too.
    expect(await codeOf(refreshSession(ctx, next.refreshToken))).toBe('SESSION_EXPIRED');
  });

  it('leaves other sign-ins of the same user alone', async () => {
    const phone = await signInWithIdentity(ctx, peter);
    const tablet = await signInWithIdentity(ctx, peter);
    await refreshSession(ctx, phone.session.refreshToken);
    advance(REFRESH_RETRY_GRACE_SECONDS + 1);
    await codeOf(refreshSession(ctx, phone.session.refreshToken));
    expect(await codeOf(refreshSession(ctx, tablet.session.refreshToken))).toBeUndefined();
  });

  it('rejects an unknown or expired token', async () => {
    expect(await codeOf(refreshSession(ctx, 'never-issued'))).toBe('SESSION_EXPIRED');
    const { session } = await signInWithIdentity(ctx, peter);
    advance(61 * 24 * 60 * 60);
    expect(await codeOf(refreshSession(ctx, session.refreshToken))).toBe('SESSION_EXPIRED');
  });
});

describe('signing out', () => {
  it('ends that sign-in so its refresh token stops working', async () => {
    const { session } = await signInWithIdentity(ctx, peter);
    await signOut(ctx, session.refreshToken);
    expect(await codeOf(refreshSession(ctx, session.refreshToken))).toBe('SESSION_EXPIRED');
  });

  it('succeeds quietly for a token it does not know', async () => {
    await expect(signOut(ctx, 'unknown')).resolves.toBeUndefined();
  });
});
