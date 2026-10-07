import type { User } from '../profile/types';

// Tokens the API issues at sign-in and on every refresh.
export type Session = {
  accessToken: string;
  accessTokenExpiresAt: string; // ISO time
  refreshToken: string;
};

// What is kept in the phone's secure storage. The user is stored with the tokens so the app knows
// who is signed in at launch without asking the server, which is what lets it open offline.
export type StoredAuth = { session: Session; user: User };

// Refresh a little before the access token expires, so a request is never sent with a token that
// runs out on the way to the server.
export const REFRESH_MARGIN_MS = 60_000;

export function needsRefresh(session: Session, nowMs: number, marginMs = REFRESH_MARGIN_MS): boolean {
  const expiresAt = Date.parse(session.accessTokenExpiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt - nowMs <= marginMs;
}

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

// Reads what was stored. Anything damaged or from an older shape counts as signed out rather than
// crashing the app at launch.
export function parseStoredAuth(raw: string | null): StoredAuth | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const { session, user } = (value ?? {}) as Partial<StoredAuth>;
  if (!session || !isString(session.accessToken) || !isString(session.refreshToken) || !isString(session.accessTokenExpiresAt)) {
    return null;
  }
  if (!user || !isString(user.id) || typeof user.email !== 'string' || typeof user.displayName !== 'string') {
    return null;
  }
  return {
    session: {
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshToken: session.refreshToken,
    },
    user: { id: user.id, email: user.email, displayName: user.displayName, avatarUrl: isString(user.avatarUrl) ? user.avatarUrl : null },
  };
}
