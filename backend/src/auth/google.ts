import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AppError, unauthorized } from '../lib/errors.js';

// Google publishes the public keys it signs ID tokens with here; jose caches and rotates them.
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export type GoogleVerifier = (idToken: string) => Promise<GoogleIdentity>;

type Options = {
  clientIds: string[];
  // Overridable so tests can sign tokens with their own key.
  keys?: JWTVerifyGetKey;
  now?: () => Date;
};

// Checks a Google ID token the way Google's documentation requires: signature, issuer,
// audience (one of our client IDs) and expiry. Accounts without a verified email are refused.
export function createGoogleVerifier({ clientIds, keys, now }: Options): GoogleVerifier {
  const getKey = keys ?? createRemoteJWKSet(GOOGLE_JWKS_URL);
  return async (idToken) => {
    if (clientIds.length === 0) {
      throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not set up on this server yet.');
    }
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, getKey, {
        issuer: GOOGLE_ISSUERS,
        audience: clientIds,
        algorithms: ['RS256'],
        currentDate: now?.(),
      }));
    } catch {
      throw unauthorized('GOOGLE_TOKEN_INVALID', 'Google sign-in could not be confirmed. Try again.');
    }
    const email = typeof payload.email === 'string' ? payload.email : null;
    if (!payload.sub || !email || payload.email_verified !== true) {
      throw unauthorized('GOOGLE_EMAIL_UNVERIFIED', 'This Google account has no verified email address.');
    }
    return {
      sub: payload.sub,
      email,
      name: typeof payload.name === 'string' ? payload.name : null,
      picture: typeof payload.picture === 'string' ? payload.picture : null,
    };
  };
}
