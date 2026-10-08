import { Router } from 'express';
import type { Db } from '../db/client.js';
import { parseInput } from '../lib/validation.js';
import { currentUserId } from '../middleware/auth.js';
import { profilePatchSchema } from '../me/schema.js';
import { getMe, updateMe } from '../me/service.js';

// Routes for the signed-in user's own account. Mounted behind requireAuth.
export function meRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await getMe(db, currentUserId(res)));
  });

  router.patch('/', async (req, res) => {
    const at = now();
    const patch = parseInput(profilePatchSchema(at), req.body);
    res.json(await updateMe(db, currentUserId(res), patch, at));
  });

  return router;
}
