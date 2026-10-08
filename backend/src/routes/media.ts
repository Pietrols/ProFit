import { eq } from 'drizzle-orm';
import express, { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { media } from '../db/schema.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { parseInput } from '../lib/validation.js';
import { MAX_MEDIA_BYTES, MEDIA_TYPES, matchesType, type MediaStore, type MediaType } from '../media/store.js';
import { currentUserId } from '../middleware/auth.js';

const Params = z.object({ id: z.uuid() });

// Images users upload (exercise photos for now). Mounted behind requireAuth.
// The phone makes the id, so a retried upload replaces the same file instead of adding another.
export function mediaRouter(db: Db, store: MediaStore): Router {
  const router = Router();

  router.put('/:id', express.raw({ type: () => true, limit: MAX_MEDIA_BYTES }), async (req, res) => {
    const { id } = parseInput(Params, req.params);
    const userId = currentUserId(res);
    const type = (req.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase() as MediaType;
    if (!MEDIA_TYPES.includes(type)) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send a JPEG, PNG or WebP image.');
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (bytes.length === 0) throw badRequest('The image is empty.');
    if (!matchesType(bytes, type)) throw badRequest(`The file is not a ${type.split('/')[1]!.toUpperCase()} image.`);

    // An id already used by someone else is answered as if it did not exist, so ids reveal nothing.
    const [existing] = await db.select({ userId: media.userId }).from(media).where(eq(media.id, id));
    if (existing && existing.userId !== userId) throw notFound('No such image.');

    await store.write(userId, id, bytes);
    await db
      .insert(media)
      .values({ id, userId, contentType: type, bytes: bytes.length })
      .onConflictDoUpdate({ target: media.id, set: { contentType: type, bytes: bytes.length } });
    res.status(201).json({ id, contentType: type, bytes: bytes.length });
  });

  // Only the owner can read an image for now; shared plans make some public in Phase 9.
  router.get('/:id', async (req, res) => {
    const { id } = parseInput(Params, req.params);
    const [row] = await db.select().from(media).where(eq(media.id, id));
    if (!row || row.userId !== currentUserId(res)) throw notFound('No such image.');
    const bytes = await store.read(row.userId, id).catch(() => null);
    if (!bytes) throw notFound('No such image.');
    res.set({ 'Content-Type': row.contentType, 'Cache-Control': 'private, max-age=86400' }).send(bytes);
  });

  return router;
}
