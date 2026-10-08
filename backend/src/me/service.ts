import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { profiles, users } from '../db/schema.js';
import { unauthorized } from '../lib/errors.js';
import { profileDto, userDto } from './dto.js';
import type { ProfilePatch } from './schema.js';

export async function getMe(db: Db, userId: string) {
  const [row] = await db
    .select({ user: users, profile: profiles })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId));
  // A valid token for a deleted account: treat it as signed out.
  if (!row) throw unauthorized('UNAUTHENTICATED', 'Sign in to continue.');
  return { user: userDto(row.user), profile: profileDto(row.profile) };
}

export async function updateMe(db: Db, userId: string, patch: ProfilePatch, now: Date) {
  const { displayName, ...profileFields } = patch;
  await db.transaction(async (tx) => {
    if (displayName !== undefined) {
      await tx.update(users).set({ displayName, updatedAt: now }).where(eq(users.id, userId));
    }
    if (Object.keys(profileFields).length > 0) {
      await tx.update(profiles).set({ ...profileFields, updatedAt: now }).where(eq(profiles.userId, userId));
    }
  });
  return getMe(db, userId);
}
