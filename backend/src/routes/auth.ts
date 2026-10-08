import { Router } from 'express';
import { z } from 'zod';
import type { GoogleVerifier } from '../auth/google.js';
import { refreshSession, signInWithIdentity, signOut, type AuthContext } from '../auth/service.js';
import { profileDto, userDto } from '../me/dto.js';
import { parseInput } from '../lib/validation.js';

const GoogleBody = z.strictObject({ idToken: z.string().min(1) });
const RefreshBody = z.strictObject({ refreshToken: z.string().min(1) });
const DevBody = z.strictObject({ email: z.email(), name: z.string().trim().max(60).optional() });

type Options = { ctx: AuthContext; verifyGoogle: GoogleVerifier; devLogin: boolean };

export function authRouter({ ctx, verifyGoogle, devLogin }: Options): Router {
  const router = Router();

  router.post('/google', async (req, res) => {
    const { idToken } = parseInput(GoogleBody, req.body);
    const identity = await verifyGoogle(idToken);
    const result = await signInWithIdentity(ctx, identity);
    res.json({ session: result.session, user: userDto(result.user), profile: profileDto(result.profile) });
  });

  // Emulators and local tests sign in with any email. Only mounted when AUTH_DEV_LOGIN is on,
  // which the config refuses in production.
  if (devLogin) {
    router.post('/dev', async (req, res) => {
      const { email, name } = parseInput(DevBody, req.body);
      const normalised = email.toLowerCase();
      const result = await signInWithIdentity(ctx, { sub: `dev:${normalised}`, email: normalised, name: name ?? null, picture: null });
      res.json({ session: result.session, user: userDto(result.user), profile: profileDto(result.profile) });
    });
  }

  router.post('/refresh', async (req, res) => {
    const { refreshToken } = parseInput(RefreshBody, req.body);
    res.json({ session: await refreshSession(ctx, refreshToken) });
  });

  router.post('/sign-out', async (req, res) => {
    const { refreshToken } = parseInput(RefreshBody, req.body);
    await signOut(ctx, refreshToken);
    res.status(204).end();
  });

  return router;
}
