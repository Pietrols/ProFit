// Phase 4 sync tests: the airplane-mode flow. Log locally, sync on
// reconnect, retry after failures — never a duplicate, delta preserved.
import { describe, expect, it } from 'vitest';
import { computeDelta } from '../../features/workout/computeDelta';
import { PlanDay } from '../planRepo';
import { migrate } from '../schema';
import {
  countSessions,
  getUnsyncedSessions,
  listSessionsLocal,
  saveSessionLocal,
} from '../workoutRepo';
import { pushWorkouts } from '../workoutSync';
import { SessionExercise, WorkoutSessionPayload } from '../workoutTypes';
import { createTestDb } from './testDb';

function payload(id: string): WorkoutSessionPayload {
  return {
    id,
    planId: 'plan-1',
    planDayId: 'day-1',
    dayName: 'Push',
    category: 'bodybuilding',
    context: 'gym',
    startedAt: '2026-07-12T09:00:00.000Z',
    finishedAt: '2026-07-12T09:45:00.000Z',
    durationSeconds: 2700,
    delta: {
      plannedExerciseCount: 2,
      completedExerciseCount: 2,
      plannedSetCount: 6,
      completedSetCount: 6,
      skippedExercises: [],
      swappedExercises: [],
      cutShort: false,
    },
    exercises: [],
  };
}

describe('workout sync queue', () => {
  it('saving twice (finish + retry) keeps one local row', async () => {
    const db = createTestDb();
    await migrate(db);
    await saveSessionLocal(db, payload('s-1'));
    await saveSessionLocal(db, payload('s-1'));
    expect(await countSessions(db)).toBe(1);
  });

  it('pushes unsynced sessions once; replays only until acked', async () => {
    const db = createTestDb();
    await migrate(db);
    await saveSessionLocal(db, payload('s-1'));
    await saveSessionLocal(db, payload('s-2'));

    const batches: string[][] = [];
    const post = async (sessions: WorkoutSessionPayload[]) => {
      batches.push(sessions.map((s) => s.id));
      return { synced: sessions.map((s) => s.id) };
    };

    // "reconnect": both pending sessions go up
    expect((await pushWorkouts(db, post)).pushed).toBe(2);
    // second call: nothing pending, no network chatter
    expect((await pushWorkouts(db, post)).pushed).toBe(0);
    expect(batches).toEqual([['s-1', 's-2']]);
    expect(await getUnsyncedSessions(db)).toHaveLength(0);
  });

  it('a dropped response replays the same batch — server upsert dedupes', async () => {
    const db = createTestDb();
    await migrate(db);
    await saveSessionLocal(db, payload('s-1'));

    // First attempt: server wrote, but the ack never arrived
    await expect(
      pushWorkouts(db, async () => {
        throw new Error('network dropped');
      }),
    ).rejects.toThrow();
    expect(await getUnsyncedSessions(db)).toHaveLength(1); // still queued

    const seen: string[][] = [];
    await pushWorkouts(db, async (sessions) => {
      seen.push(sessions.map((s) => s.id));
      return { synced: sessions.map((s) => s.id) };
    });
    expect(seen).toEqual([['s-1']]); // same idempotency key replayed
    expect(await getUnsyncedSessions(db)).toHaveLength(0);
    expect(await countSessions(db)).toBe(1); // and still exactly one local row
  });

  it('a local re-save after syncing does not lose the synced flag', async () => {
    const db = createTestDb();
    await migrate(db);
    await saveSessionLocal(db, payload('s-1'));
    await pushWorkouts(db, async (s) => ({ synced: s.map((x) => x.id) }));
    await saveSessionLocal(db, payload('s-1')); // e.g. summary screen re-save
    expect((await listSessionsLocal(db))[0].synced).toBe(true);
  });
});

describe('computeDelta', () => {
  const day: PlanDay = {
    id: 'day-1',
    dayIndex: 0,
    name: 'Push',
    category: 'bodybuilding',
    exercises: [
      { id: 'pe1', order: 0, exerciseId: 'bench', sets: 3, reps: '8-12', restSeconds: 90, exercise: {} as never },
      { id: 'pe2', order: 1, exerciseId: 'ohp', sets: 3, reps: '8-12', restSeconds: 90, exercise: {} as never },
      { id: 'pe3', order: 2, exerciseId: 'lateral', sets: 3, reps: '12-15', restSeconds: 60, exercise: {} as never },
    ],
  };

  it('captures skips, swaps, and cut-short in the AI-consumable shape', () => {
    const exercises: SessionExercise[] = [
      {
        id: 'e1', order: 0, plannedExerciseId: 'bench', actualExerciseId: 'db-bench', skipped: false,
        sets: [
          { id: 't1', setIndex: 0, plannedReps: '8-12', plannedWeightKg: null, actualReps: 10, weightKg: 30, completed: true },
          { id: 't2', setIndex: 1, plannedReps: '8-12', plannedWeightKg: null, actualReps: 8, weightKg: 30, completed: true },
          { id: 't3', setIndex: 2, plannedReps: '8-12', plannedWeightKg: null, actualReps: null, weightKg: null, completed: false },
        ],
      },
      {
        id: 'e2', order: 1, plannedExerciseId: 'ohp', actualExerciseId: 'ohp', skipped: false,
        sets: [
          { id: 't4', setIndex: 0, plannedReps: '8-12', plannedWeightKg: null, actualReps: 12, weightKg: 20, completed: true },
        ],
      },
      { id: 'e3', order: 2, plannedExerciseId: 'lateral', actualExerciseId: 'lateral', skipped: true, sets: [] },
    ];

    const delta = computeDelta(
      day,
      exercises,
      new Map([['lateral', 'Side Lateral Raise']]),
      new Map([['e1', 'equipment']]),
    );

    expect(delta).toEqual({
      plannedExerciseCount: 3,
      completedExerciseCount: 2,
      plannedSetCount: 9,
      completedSetCount: 3,
      skippedExercises: [{ exerciseId: 'lateral', name: 'Side Lateral Raise' }],
      swappedExercises: [
        { fromExerciseId: 'bench', toExerciseId: 'db-bench', reason: 'equipment' },
      ],
      cutShort: true,
    });
  });
});
