import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openTestDatabase, resetTables } from '../test/db.js';
import { profiles, users } from './schema.js';

const database = openTestDatabase();
beforeEach(() => resetTables(database));
afterAll(() => database.close());

describe('accounts schema', () => {
  it('creates a user and a profile with metric units and pending onboarding by default', async () => {
    const [user] = await database.db.insert(users).values({ googleSub: 'g-1', email: 'a@example.com' }).returning();
    await database.db.insert(profiles).values({ userId: user!.id });
    const [profile] = await database.db.select().from(profiles).where(eq(profiles.userId, user!.id));
    expect(profile).toMatchObject({ unitSystem: 'metric', onboardingStatus: 'pending', goal: null });
  });

  it('allows one user per Google account', async () => {
    await database.db.insert(users).values({ googleSub: 'g-1', email: 'a@example.com' });
    await expect(database.db.insert(users).values({ googleSub: 'g-1', email: 'b@example.com' })).rejects.toThrow();
  });

  it('removes the profile when the user is deleted', async () => {
    const [user] = await database.db.insert(users).values({ googleSub: 'g-2', email: 'c@example.com' }).returning();
    await database.db.insert(profiles).values({ userId: user!.id });
    await database.db.delete(users).where(eq(users.id, user!.id));
    expect(await database.db.select().from(profiles)).toHaveLength(0);
  });
});
