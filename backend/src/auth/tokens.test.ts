import { describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors.js';
import { ACCESS_TOKEN_TTL_SECONDS, hashToken, newRefreshToken, refreshExpiry, signAccessToken, verifyAccessToken } from './tokens.js';

const SECRET = 's'.repeat(40);
const USER = '6f1c2b0e-0000-4000-8000-000000000001';
const now = new Date('2026-10-05T08:00:00Z');

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err instanceof AppError ? err.code : 'NOT_APP_ERROR';
  }
}

describe('access tokens', () => {
  it('round-trips the user id and expires after 15 minutes', async () => {
    const { token, expiresAt } = await signAccessToken(USER, SECRET, now);
    expect(expiresAt.getTime() - now.getTime()).toBe(ACCESS_TOKEN_TTL_SECONDS * 1000);
    expect(await verifyAccessToken(token, SECRET, now)).toBe(USER);
  });

  it('reports an expired token as TOKEN_EXPIRED so the app knows to refresh', async () => {
    const { token } = await signAccessToken(USER, SECRET, now);
    const later = new Date(now.getTime() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);
    expect(await codeOf(verifyAccessToken(token, SECRET, later))).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token signed with another secret', async () => {
    const { token } = await signAccessToken(USER, 'o'.repeat(40), now);
    expect(await codeOf(verifyAccessToken(token, SECRET, now))).toBe('UNAUTHENTICATED');
  });

  it('rejects garbage', async () => {
    expect(await codeOf(verifyAccessToken('not-a-token', SECRET, now))).toBe('UNAUTHENTICATED');
  });
});

describe('refresh tokens', () => {
  it('are long, random and URL-safe', () => {
    const a = newRefreshToken();
    const b = newRefreshToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hash to a stable value that does not contain the token', () => {
    const token = newRefreshToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });

  it('last 60 days', () => {
    expect(refreshExpiry(now).toISOString()).toBe('2026-12-04T08:00:00.000Z');
  });
});
