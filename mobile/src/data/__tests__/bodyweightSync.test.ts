import { describe, expect, it } from 'vitest';
import {
  listBodyweightLocal,
  pushBodyweight,
  saveBodyweightLocal,
} from '../bodyweightRepo';
import { migrate } from '../schema';
import { createTestDb } from './testDb';

const entry = (id: string, weightKg = 82.5) => ({
  id,
  weightKg,
  loggedAt: '2026-07-15T07:00:00.000Z',
});

describe('bodyweight sync queue', () => {
  it('is idempotent locally and replay-safe on push', async () => {
    const db = createTestDb();
    await migrate(db);
    await saveBodyweightLocal(db, entry('b-1'));
    await saveBodyweightLocal(db, entry('b-1', 82.1)); // correction
    expect(await listBodyweightLocal(db)).toHaveLength(1);
    expect((await listBodyweightLocal(db))[0].weightKg).toBe(82.1);

    await expect(
      pushBodyweight(db, async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow();

    const batches: string[][] = [];
    await pushBodyweight(db, async (entries) => {
      batches.push(entries.map((e) => e.id));
      return { synced: entries.map((e) => e.id) };
    });
    expect((await pushBodyweight(db, async () => ({ synced: [] }))).pushed).toBe(0);
    expect(batches).toEqual([['b-1']]);
  });
});
