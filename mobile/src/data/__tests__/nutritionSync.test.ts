import { describe, expect, it } from 'vitest';
import {
  listMealsLocal,
  listProfileLocal,
  pushMeals,
  saveMealLocal,
  saveProfileItemLocal,
} from '../nutritionRepo';
import { migrate } from '../schema';
import { createTestDb } from './testDb';

const meal = (id: string, name = 'Chicken wrap') => ({
  id,
  name,
  portion: '1 wrap',
  mealType: 'lunch' as const,
  loggedAt: '2026-07-15T13:00:00.000Z',
  protein: null,
  carbs: null,
  fat: null,
  calories: null,
  estimatedFields: [],
});

describe('nutrition sync queue', () => {
  it('meal logging is idempotent locally and replay-safe on push', async () => {
    const db = createTestDb();
    await migrate(db);
    await saveMealLocal(db, meal('m-1'));
    await saveMealLocal(db, meal('m-1', 'Chicken wrap (large)')); // correction
    expect(await listMealsLocal(db)).toHaveLength(1);
    expect((await listMealsLocal(db))[0].name).toBe('Chicken wrap (large)');

    await expect(
      pushMeals(db, async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow();

    const batches: string[][] = [];
    await pushMeals(db, async (rows) => {
      batches.push(rows.map((r) => r.id));
      return { synced: rows.map((r) => r.id) };
    });
    expect((await pushMeals(db, async () => ({ synced: [] }))).pushed).toBe(0);
    expect(batches).toEqual([['m-1']]);
  });

  it('round-trips macros and estimatedFields through local storage', async () => {
    const db = createTestDb();
    await migrate(db);
    await saveMealLocal(db, {
      ...meal('m-2', 'shawarma'),
      protein: 100,
      carbs: 45,
      fat: 30,
      calories: 650,
      estimatedFields: ['carbs', 'fat', 'calories'],
    });
    const [stored] = await listMealsLocal(db);
    expect(stored.protein).toBe(100);
    expect(stored.calories).toBe(650);
    expect(stored.estimatedFields).toEqual(['carbs', 'fat', 'calories']);
  });

  it('profile items support soft delete', async () => {
    const db = createTestDb();
    await migrate(db);
    await saveProfileItemLocal(db, {
      id: 'p-1',
      name: 'Porridge',
      typicalPortion: '1 bowl',
      deletedAt: null,
    });
    expect(await listProfileLocal(db)).toHaveLength(1);
    await saveProfileItemLocal(db, {
      id: 'p-1',
      name: 'Porridge',
      typicalPortion: '1 bowl',
      deletedAt: '2026-07-15T10:00:00.000Z',
    });
    expect(await listProfileLocal(db)).toHaveLength(0);
  });
});
