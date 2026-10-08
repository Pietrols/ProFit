import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { parseInput } from '../lib/validation.js';
import { currentUserId } from '../middleware/auth.js';
import { COLLECTION_NAMES, type CollectionName } from '../sync/collections.js';
import { MAX_BATCH, pull, push } from '../sync/service.js';

// Each record is validated on its own inside push(), so one bad record is reported instead of
// failing the whole batch. Here only the envelope is checked.
const PushBody = z.strictObject({
  changes: z.strictObject(
    Object.fromEntries(COLLECTION_NAMES.map((name) => [name, z.array(z.unknown()).max(MAX_BATCH).optional()])) as Record<
      CollectionName,
      z.ZodOptional<z.ZodArray<z.ZodUnknown>>
    >,
  ),
});

const PullQuery = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_BATCH).default(MAX_BATCH),
});

// Mounted behind requireAuth.
export function syncRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.post('/push', async (req, res) => {
    const { changes } = parseInput(PushBody, req.body);
    res.json(await push(db, currentUserId(res), changes, now()));
  });

  router.get('/pull', async (req, res) => {
    const { since, limit } = parseInput(PullQuery, req.query);
    res.json(await pull(db, currentUserId(res), since, limit));
  });

  return router;
}
