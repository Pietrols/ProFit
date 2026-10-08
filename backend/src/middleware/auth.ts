import type { RequestHandler, Response } from 'express';
import { verifyAccessToken } from '../auth/tokens.js';
import { unauthorized } from '../lib/errors.js';

// Protects a route: needs "Authorization: Bearer <access token>". Puts the user id on res.locals.
export function requireAuth(secret: string, now: () => Date): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const match = /^Bearer (.+)$/i.exec(header);
    if (!match?.[1]) return next(unauthorized('UNAUTHENTICATED', 'Sign in to continue.'));
    res.locals.userId = await verifyAccessToken(match[1], secret, now());
    next();
  };
}

export function currentUserId(res: Response): string {
  const id = res.locals.userId;
  if (typeof id !== 'string') throw unauthorized('UNAUTHENTICATED', 'Sign in to continue.');
  return id;
}
