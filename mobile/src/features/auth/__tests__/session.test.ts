import { describe, expect, it } from 'vitest';
import { needsRefresh, parseStoredAuth, type StoredAuth } from '../session';

const NOW = Date.parse('2026-10-07T10:00:00Z');
const at = (offsetSeconds: number) => new Date(NOW + offsetSeconds * 1000).toISOString();
const session = (expiresAt: string) => ({ accessToken: 'a', accessTokenExpiresAt: expiresAt, refreshToken: 'r' });

describe('needsRefresh', () => {
  it('is false while the token has more than a minute left', () => {
    expect(needsRefresh(session(at(61)), NOW)).toBe(false);
  });

  it('is true within the last minute and after expiry', () => {
    expect(needsRefresh(session(at(60)), NOW)).toBe(true);
    expect(needsRefresh(session(at(-5)), NOW)).toBe(true);
  });

  it('is true when the expiry cannot be read', () => {
    expect(needsRefresh(session('not a date'), NOW)).toBe(true);
  });
});

describe('parseStoredAuth', () => {
  const stored: StoredAuth = {
    session: session(at(900)),
    user: { id: 'u1', email: 'peter@example.com', displayName: 'Peter', avatarUrl: null },
  };

  it('reads back what was stored', () => {
    expect(parseStoredAuth(JSON.stringify(stored))).toEqual(stored);
  });

  it('treats nothing, broken JSON and missing tokens as signed out', () => {
    expect(parseStoredAuth(null)).toBeNull();
    expect(parseStoredAuth('{not json')).toBeNull();
    expect(parseStoredAuth('null')).toBeNull();
    expect(parseStoredAuth(JSON.stringify({ ...stored, session: { accessToken: 'a' } }))).toBeNull();
    expect(parseStoredAuth(JSON.stringify({ session: stored.session }))).toBeNull();
  });

  it('drops unexpected fields and normalises a missing avatar', () => {
    const extra = { ...stored, extra: true, user: { id: 'u1', email: 'peter@example.com', displayName: 'Peter' } };
    expect(parseStoredAuth(JSON.stringify(extra))).toEqual(stored);
  });
});
