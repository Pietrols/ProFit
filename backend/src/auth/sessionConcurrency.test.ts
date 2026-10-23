import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { createDatabase } from '../db/client.js';
import { users } from '../db/schema.js';
import { TEST_DATABASE_URL } from '../test/database-url.js';
import { openTestDatabase, resetTables } from '../test/db.js';
import { refreshSession, signInWithIdentity, signOut } from './service.js';

const database = openTestDatabase();
const now = () => new Date('2026-10-22T10:00:00Z');
const ctx = { db: database.db, secret: 's'.repeat(40), now };
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function namedDatabase(name: string) {
  const url = new URL(TEST_DATABASE_URL);
  url.searchParams.set('application_name', name);
  return createDatabase(url.toString());
}
async function waitingForLock(name: string) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const result = await database.pool.query<{ waiting: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_stat_activity
       WHERE application_name = $1 AND wait_event_type = 'Lock') AS waiting`,
      [name],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`The controlled ${name} operation did not reach its lock.`);
}

beforeEach(() => resetTables(database));
afterAll(() => database.close());

it.each(['same token', 'sibling token'])(
  'revokes a token created concurrently with sign-out: %s',
  async (mode) => {
    const signedIn = await signInWithIdentity(ctx, {
      sub: 'concurrency-user',
      email: 'concurrency@example.invalid',
      name: 'Concurrency',
      picture: null,
    });
    let rotatingToken = signedIn.session.refreshToken;
    let signOutToken = rotatingToken;
    if (mode === 'sibling token') {
      rotatingToken = (await refreshSession(ctx, rotatingToken)).refreshToken;
      signOutToken = (await refreshSession(ctx, signOutToken)).refreshToken;
    }
    const rotating = namedDatabase('profit_refresh_race');
    const signingOut = namedDatabase('profit_signout_race');
    const locked = deferred();
    const release = deferred();
    // Holding the user row lets refresh update its token, then blocks its child-token FK insert.
    const blocker = database.db.transaction(async (tx) => {
      await tx.select().from(users).where(eq(users.id, signedIn.user.id)).for('update');
      locked.resolve();
      await release.promise;
    });
    void blocker.catch(locked.reject);
    const pending: Promise<unknown>[] = [blocker];
    try {
      await locked.promise;
      const refresh = refreshSession({ ...ctx, db: rotating.db }, rotatingToken);
      pending.push(refresh);
      void refresh.catch(() => {});
      await waitingForLock('profit_refresh_race');
      const logout = signOut({ ...ctx, db: signingOut.db }, signOutToken);
      pending.push(logout);
      void logout.catch(() => {});
      await waitingForLock('profit_signout_race');
      release.resolve();
      const issued = await refresh;
      await logout;
      await expect(refreshSession(ctx, issued.refreshToken)).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });
      const live = await database.db.execute(
        sql`SELECT COUNT(*) AS count FROM refresh_tokens WHERE revoked_at IS NULL`,
      );
      expect(Number(live.rows[0]?.count)).toBe(0);
    } finally {
      release.resolve();
      await Promise.allSettled(pending);
      await Promise.all([rotating.close(), signingOut.close()]);
    }
  },
);
