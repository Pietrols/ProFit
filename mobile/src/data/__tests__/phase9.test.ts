// Phase 9 hardening tests: substitution engine + sync-queue quarantine.
import { describe, expect, it } from 'vitest';
import { findSubstitutes, upsertExercises } from '../exercisesRepo';
import { migrate } from '../schema';
import { Exercise } from '../types';
import { getUnsyncedSessions, saveSessionLocal } from '../workoutRepo';
import { pushWorkouts } from '../workoutSync';
import { WorkoutSessionPayload } from '../workoutTypes';
import { createTestDb } from './testDb';

const ex = (id: string, extra: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id,
  category: 'bodybuilding',
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: ['barbell'],
  demoUrl: `https://x/${id}.jpg`,
  instructions: [],
  homeAlternativeId: null,
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...extra,
});

describe('substitution engine', () => {
  it('offers same-muscle, context-appropriate swaps with the curated alternative first', async () => {
    const db = createTestDb();
    await migrate(db);
    await upsertExercises(db, [
      ex('bench', { homeAlternativeId: 'pushups' }),
      ex('pushups', { equipment: ['bodyweight'] }),
      ex('db-bench', { equipment: ['dumbbell'] }),
      ex('cable-fly', { equipment: ['cable'] }),
      ex('squat', { primaryMuscles: ['quadriceps'] }), // wrong muscle
    ]);

    const home = await findSubstitutes(db, ex('bench', { homeAlternativeId: 'pushups' }), 'home');
    expect(home.map((e) => e.id)).toEqual(['pushups', 'db-bench']); // no cable at home, alt first

    const gym = await findSubstitutes(db, ex('bench', { homeAlternativeId: 'pushups' }), 'gym');
    expect(gym.map((e) => e.id)).toContain('cable-fly');
    expect(gym.map((e) => e.id)).not.toContain('squat');
  });
});

const payload = (id: string): WorkoutSessionPayload => ({
  id,
  planId: null,
  planDayId: null,
  dayName: 'Push',
  category: 'bodybuilding',
  context: 'gym',
  startedAt: '2026-07-15T09:00:00.000Z',
  finishedAt: '2026-07-15T10:00:00.000Z',
  durationSeconds: 3600,
  delta: {
    plannedExerciseCount: 0,
    completedExerciseCount: 0,
    plannedSetCount: 0,
    completedSetCount: 0,
    skippedExercises: [],
    swappedExercises: [],
    cutShort: false,
  },
  exercises: [],
});

describe('sync-queue quarantine (conflict hardening)', () => {
  it('a permanent 4xx quarantines the batch instead of poisoning the queue', async () => {
    const db = createTestDb();
    await migrate(db);
    await saveSessionLocal(db, payload('bad-1'));

    const res = await pushWorkouts(db, async () => {
      throw Object.assign(new Error('owner mismatch'), { status: 409 });
    });
    expect(res).toEqual({ pushed: 0, quarantined: 1 });
    expect(await getUnsyncedSessions(db)).toHaveLength(0); // queue unblocked

    // a new session still syncs normally afterwards
    await saveSessionLocal(db, payload('good-1'));
    const ok = await pushWorkouts(db, async (s) => ({ synced: s.map((x) => x.id) }));
    expect(ok.pushed).toBe(1);
  });

  it('transient failures (network, 5xx, 429) keep the batch pending', async () => {
    const db = createTestDb();
    await migrate(db);
    await saveSessionLocal(db, payload('s-1'));

    for (const err of [new Error('offline'), Object.assign(new Error('server'), { status: 500 }), Object.assign(new Error('slow down'), { status: 429 })]) {
      await expect(
        pushWorkouts(db, async () => {
          throw err;
        }),
      ).rejects.toThrow();
      expect(await getUnsyncedSessions(db)).toHaveLength(1);
    }
  });
});
