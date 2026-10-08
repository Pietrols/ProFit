import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors.js';
import { createGoogleVerifier, type GoogleVerifier } from './google.js';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

const CLIENT_ID = 'web-client.apps.googleusercontent.com';
const now = new Date('2026-10-05T08:00:00Z');
const nowSeconds = Math.floor(now.getTime() / 1000);

let privateKey: PrivateKey;
let otherPrivateKey: PrivateKey;
let verify: GoogleVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherPrivateKey = other.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
  verify = createGoogleVerifier({ clientIds: [CLIENT_ID], keys: createLocalJWKSet({ keys: [jwk] }), now: () => now });
});

// Builds a token shaped like the ones Google issues, with any claim overridden.
function googleToken(claims: JWTPayload = {}, key: PrivateKey = privateKey) {
  return new SignJWT({ email: 'peter@example.com', email_verified: true, name: 'Peter', picture: 'https://example.com/p.jpg', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer((claims.iss as string) ?? 'https://accounts.google.com')
    .setAudience((claims.aud as string) ?? CLIENT_ID)
    .setSubject((claims.sub as string) ?? '1234567890')
    .setIssuedAt(nowSeconds - 60)
    .setExpirationTime((claims.exp as number) ?? nowSeconds + 3600)
    .sign(key);
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err instanceof AppError ? err.code : 'NOT_APP_ERROR';
  }
}

describe('Google ID token verification', () => {
  it('accepts a valid token and returns the identity', async () => {
    expect(await verify(await googleToken())).toEqual({
      sub: '1234567890',
      email: 'peter@example.com',
      name: 'Peter',
      picture: 'https://example.com/p.jpg',
    });
  });

  it('accepts the bare issuer form Google also uses', async () => {
    expect((await verify(await googleToken({ iss: 'accounts.google.com' }))).sub).toBe('1234567890');
  });

  it.each([
    ['another app', { aud: 'someone-else.apps.googleusercontent.com' }],
    ['a different issuer', { iss: 'https://evil.example.com' }],
    ['an expired token', { exp: nowSeconds - 10 }],
  ])('rejects a token for %s', async (_label, claims) => {
    expect(await codeOf(verify(await googleToken(claims)))).toBe('GOOGLE_TOKEN_INVALID');
  });

  it('rejects a token not signed by Google', async () => {
    expect(await codeOf(verify(await googleToken({}, otherPrivateKey)))).toBe('GOOGLE_TOKEN_INVALID');
  });

  it('refuses an account whose email is not verified', async () => {
    expect(await codeOf(verify(await googleToken({ email_verified: false })))).toBe('GOOGLE_EMAIL_UNVERIFIED');
  });

  it('says so clearly when no client IDs are configured', async () => {
    const unconfigured = createGoogleVerifier({ clientIds: [] });
    expect(await codeOf(unconfigured('anything'))).toBe('GOOGLE_NOT_CONFIGURED');
  });
});
