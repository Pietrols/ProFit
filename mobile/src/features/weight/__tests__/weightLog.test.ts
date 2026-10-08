import { describe, expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { deleteWeight, listWeights, saveWeight, weightEntryId, weightOn } from '../weightLog';

const PETER = '0b9f3c2e-1d2a-4c5b-8e9f-0a1b2c3d4e5f';
const at = (minute: number) => new Date(Date.UTC(2026, 9, 7, 8, minute));

describe('weight log', () => {
  it('gives every phone the same id for the same user and day', () => {
    expect(weightEntryId(PETER, '2026-10-07')).toBe('c0c93275-cf61-5d5b-8927-12d2b34a7e89');
    expect(weightEntryId(PETER, '2026-10-08')).not.toBe(weightEntryId(PETER, '2026-10-07'));
    expect(weightEntryId('someone-else', '2026-10-07')).not.toBe(weightEntryId(PETER, '2026-10-07'));
  });

  it('keeps one entry per day: logging again replaces it', async () => {
    const db = await testDatabase();
    await saveWeight(db, PETER, { date: '2026-10-07', weightKg: 82 }, at(0));
    await saveWeight(db, PETER, { date: '2026-10-07', weightKg: 81.6, note: '  after breakfast ' }, at(5));
    expect(await listWeights(db, PETER)).toEqual([
      { id: weightEntryId(PETER, '2026-10-07'), date: '2026-10-07', weightKg: 81.6, note: 'after breakfast', updatedAt: at(5).toISOString() },
    ]);
  });

  it('lists newest day first and marks every write for sync', async () => {
    const db = await testDatabase();
    await saveWeight(db, PETER, { date: '2026-10-05', weightKg: 82 }, at(0));
    await saveWeight(db, PETER, { date: '2026-10-07', weightKg: 81 }, at(1));
    await saveWeight(db, PETER, { date: '2026-10-06', weightKg: 81.5 }, at(2));
    expect((await listWeights(db, PETER)).map((w) => w.date)).toEqual(['2026-10-07', '2026-10-06', '2026-10-05']);
    expect(await db.first('SELECT COUNT(*) AS n FROM weight_entries WHERE dirty = 1')).toEqual({ n: 3 });
  });

  it('deletes by marking the entry, and logging that day again brings it back', async () => {
    const db = await testDatabase();
    await saveWeight(db, PETER, { date: '2026-10-07', weightKg: 81 }, at(0));
    await deleteWeight(db, PETER, '2026-10-07', at(1));
    expect(await listWeights(db, PETER)).toEqual([]);
    expect(await weightOn(db, PETER, '2026-10-07')).toBeNull();
    expect(await db.first('SELECT deleted_at, dirty FROM weight_entries')).toEqual({ deleted_at: at(1).toISOString(), dirty: 1 });

    await saveWeight(db, PETER, { date: '2026-10-07', weightKg: 80.5 }, at(2));
    expect((await weightOn(db, PETER, '2026-10-07'))?.weightKg).toBe(80.5);
  });
});
