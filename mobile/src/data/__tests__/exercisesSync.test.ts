// Phase 2 sync test: running the sync twice must not duplicate rows, and an
// updated row must replace, not append.
import { describe, expect, it } from 'vitest';
import {
  countExercises,
  getExercise,
  getMeta,
  searchExercises,
} from '../exercisesRepo';
import { syncExercises } from '../exercisesSync';
import { migrate } from '../schema';
import { Exercise } from '../types';
import { createTestDb } from './testDb';

function fixture(id: string, name: string, extra: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name,
    category: 'bodybuilding',
    primaryMuscles: ['quadriceps'],
    secondaryMuscles: ['glutes'],
    equipment: ['dumbbell'],
    demoUrl: `https://example.com/${id}.jpg`,
    instructions: ['Do the movement.'],
    homeAlternativeId: null,
    updatedAt: '2026-07-12T00:00:00.000Z',
    ...extra,
  };
}

describe('exercise sync', () => {
  it('is idempotent: syncing twice yields no duplicates', async () => {
    const db = createTestDb();
    await migrate(db);

    const page = {
      serverTime: '2026-07-12T10:00:00.000Z',
      exercises: [
        fixture('goblet-squat', 'Goblet Squat', {
          homeAlternativeId: 'bodyweight-squat',
        }),
        fixture('bodyweight-squat', 'Bodyweight Squat', {
          equipment: ['bodyweight'],
        }),
        fixture('leg-press', 'Leg Press', { equipment: ['machine'] }),
      ],
    };

    await syncExercises(db, async () => page);
    await syncExercises(db, async () => page); // retry / re-run
    expect(await countExercises(db)).toBe(3);
  });

  it('advances the cursor and applies updates in place', async () => {
    const db = createTestDb();
    await migrate(db);

    await syncExercises(db, async (cursor) => {
      expect(cursor).toBeNull(); // first sync is a full pull
      return {
        serverTime: '2026-07-12T10:00:00.000Z',
        exercises: [fixture('goblet-squat', 'Goblet Squat')],
      };
    });
    expect(await getMeta(db, 'exercises.lastSyncServerTime')).toBe(
      '2026-07-12T10:00:00.000Z',
    );

    // Incremental sync carries the cursor and replaces the changed row
    await syncExercises(db, async (cursor) => {
      expect(cursor).toBe('2026-07-12T10:00:00.000Z');
      return {
        serverTime: '2026-07-12T11:00:00.000Z',
        exercises: [
          fixture('goblet-squat', 'Goblet Squat (updated)', {
            updatedAt: '2026-07-12T10:30:00.000Z',
          }),
        ],
      };
    });
    expect(await countExercises(db)).toBe(1);
    expect((await getExercise(db, 'goblet-squat'))?.name).toBe(
      'Goblet Squat (updated)',
    );
  });

  it('search works offline against the local rows', async () => {
    const db = createTestDb();
    await migrate(db);
    await syncExercises(db, async () => ({
      serverTime: '2026-07-12T10:00:00.000Z',
      exercises: [
        fixture('goblet-squat', 'Goblet Squat'),
        fixture('leg-press', 'Leg Press', { equipment: ['machine'] }),
        fixture('rope-jumping', 'Rope Jumping', {
          category: 'cardio',
          equipment: ['bodyweight'],
        }),
      ],
    }));

    const byName = await searchExercises(db, { query: 'goblet' });
    expect(byName.map((e) => e.id)).toEqual(['goblet-squat']);

    const cardio = await searchExercises(db, { category: 'cardio' });
    expect(cardio.map((e) => e.id)).toEqual(['rope-jumping']);

    const home = await searchExercises(db, { homeOnly: true });
    expect(home.map((e) => e.id).sort()).toEqual([
      'goblet-squat',
      'rope-jumping',
    ]);
  });
});
