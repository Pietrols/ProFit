import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import { unauthorized } from '../lib/errors.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 60;

const ISSUER = 'profit-api';
const AUDIENCE = 'profit-app';

const keyFrom = (secret: string) => new TextEncoder().encode(secret);

export type AccessToken = { token: string; expiresAt: Date };

// A short-lived JWT naming the user. It is never stored on the server.
export async function signAccessToken(userId: string, secret: string, now: Date = new Date()): Promise<AccessToken> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAtSeconds = issuedAt + ACCESS_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .sign(keyFrom(secret));
  return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
}

// Returns the user id, or throws TOKEN_EXPIRED (the app should refresh) or UNAUTHENTICATED.
export async function verifyAccessToken(token: string, secret: string, now: Date = new Date()): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      currentDate: now,
    });
    if (!payload.sub) throw unauthorized('UNAUTHENTICATED', 'Sign in to continue.');
    return payload.sub;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw unauthorized('TOKEN_EXPIRED', 'Your session needs refreshing.');
    throw unauthorized('UNAUTHENTICATED', 'Sign in to continue.');
  }
}

// 256 random bits, URL-safe. Only its hash is ever written to the database.
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
