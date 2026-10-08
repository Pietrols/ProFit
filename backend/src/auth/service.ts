import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { profiles, refreshTokens, users, type Profile, type User } from '../db/schema.js';
import { unauthorized } from '../lib/errors.js';
import type { GoogleIdentity } from './google.js';
import { hashToken, newRefreshToken, refreshExpiry, signAccessToken } from './tokens.js';

// A refresh token that was used moments ago may be presented again when the phone never received
// the reply (dropped mobile data). Within this window that is treated as a retry, not as theft.
export const REFRESH_RETRY_GRACE_SECONDS = 60;

export type Session = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
};

export type AuthContext = { db: Db; secret: string; now: () => Date };

export type SignInResult = { session: Session; user: User; profile: Profile };

const sessionExpired = () => unauthorized('SESSION_EXPIRED', 'Your session has ended. Sign in again.');

// Find the user by their Google account id, or create them with an empty profile.
// The display name is only taken from Google on first sign-in, so a name the user edited stays.
export async function signInWithIdentity(ctx: AuthContext, identity: GoogleIdentity): Promise<SignInResult> {
  const now = ctx.now();
  const fallbackName = identity.name?.trim() || identity.email.split('@')[0] || '';
  const [user] = await ctx.db
    .insert(users)
    .values({ googleSub: identity.sub, email: identity.email, displayName: fallbackName, avatarUrl: identity.picture })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: { email: identity.email, avatarUrl: sql`coalesce(${users.avatarUrl}, ${identity.picture})`, updatedAt: now },
    })
    .returning();
  if (!user) throw new Error('User upsert returned no row');

  await ctx.db.insert(profiles).values({ userId: user.id }).onConflictDoNothing();
  const [profile] = await ctx.db.select().from(profiles).where(eq(profiles.userId, user.id));
  if (!profile) throw new Error('Profile missing after sign-in');

  const session = await issueSession(ctx.db, ctx.secret, user.id, randomUUID(), now);
  return { session, user, profile };
}

async function issueSession(db: Db, secret: string, userId: string, familyId: string, now: Date): Promise<Session> {
  const access = await signAccessToken(userId, secret, now);
  const refreshToken = newRefreshToken();
  await db.insert(refreshTokens).values({
    userId,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiry(now),
    createdAt: now,
  });
  return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString(), refreshToken };
}

// Trade a refresh token for a new pair. Each token works once; a token presented again after the
// grace window means it was copied, so every token from that sign-in is revoked.
export async function refreshSession(ctx: AuthContext, refreshToken: string): Promise<Session> {
  const now = ctx.now();
  // The transaction returns null instead of throwing, so a revocation inside it is committed
  // (throwing would roll it back and the stolen token's family would stay valid).
  const session = await ctx.db.transaction(async (tx): Promise<Session | null> => {
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)))
      .for('update');

    if (!row || row.revokedAt || row.expiresAt <= now) return null;

    if (row.usedAt) {
      const secondsSinceUse = (now.getTime() - row.usedAt.getTime()) / 1000;
      if (secondsSinceUse > REFRESH_RETRY_GRACE_SECONDS) {
        await revokeFamily(tx, row.familyId, now);
        return null;
      }
    } else {
      await tx.update(refreshTokens).set({ usedAt: now }).where(eq(refreshTokens.id, row.id));
    }

    return issueSession(tx, ctx.secret, row.userId, row.familyId, now);
  });
  if (!session) throw sessionExpired();
  return session;
}

// Ends the sign-in this token belongs to. Unknown tokens are ignored so signing out always succeeds.
export async function signOut(ctx: AuthContext, refreshToken: string): Promise<void> {
  const [row] = await ctx.db
    .select({ familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)));
  if (row) await revokeFamily(ctx.db, row.familyId, ctx.now());
}

async function revokeFamily(db: Db, familyId: string, now: Date): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}
