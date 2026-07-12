// Live rehearsal of the Phase 4 done-when against a running backend:
// log a session "in airplane mode" (local SQLite only, push fails), then
// reconnect, push, and replay — asserting no duplicates and delta intact.
// Run: EXPO_PUBLIC_API_URL=http://localhost:4000 npx tsx scripts/e2e-sync-rehearsal.ts
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '../src/data/__tests__/testDb';
import { migrate } from '../src/data/schema';
import { getUnsyncedSessions, saveSessionLocal } from '../src/data/workoutRepo';
import { pushWorkouts } from '../src/data/workoutSync';
import { WorkoutSessionPayload } from '../src/data/workoutTypes';
import { api } from '../src/api/client';

async function main() {
  const email = `e2e-p4-${Date.now()}@profit.dev`;
  const { token } = await api.register({
    email,
    password: 'e2e-password-1',
    displayName: 'E2E',
  });

  const db = createTestDb();
  await migrate(db);

  const payload: WorkoutSessionPayload = {
    id: randomUUID(),
    planId: null,
    planDayId: null,
    dayName: 'Push',
    category: 'bodybuilding',
    context: 'home',
    startedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: 2700,
    delta: {
      plannedExerciseCount: 2,
      completedExerciseCount: 1,
      plannedSetCount: 6,
      completedSetCount: 3,
      skippedExercises: [{ exerciseId: 'pushups', name: 'Pushups' }],
      swappedExercises: [],
      cutShort: true,
    },
    exercises: [
      {
        id: randomUUID(),
        order: 0,
        plannedExerciseId: 'dumbbell-bench-press',
        actualExerciseId: 'dumbbell-bench-press',
        skipped: false,
        sets: [
          { id: randomUUID(), setIndex: 0, plannedReps: '8-12', actualReps: 10, weightKg: 22.5, completed: true },
          { id: randomUUID(), setIndex: 1, plannedReps: '8-12', actualReps: 9, weightKg: 22.5, completed: true },
          { id: randomUUID(), setIndex: 2, plannedReps: '8-12', actualReps: 7, weightKg: 22.5, completed: true },
        ],
      },
      { id: randomUUID(), order: 1, plannedExerciseId: 'pushups', actualExerciseId: 'pushups', skipped: true, sets: [] },
    ],
  };

  // 1. Airplane mode: session lands in SQLite, push fails, stays queued
  await saveSessionLocal(db, payload);
  await pushWorkouts(db, async () => {
    throw new Error('airplane mode');
  }).catch(() => {});
  assert.equal((await getUnsyncedSessions(db)).length, 1, 'still queued offline');

  // 2. Reconnect: real push to the live backend
  const first = await pushWorkouts(db, (s) => api.syncWorkouts(token, s));
  assert.equal(first.pushed, 1, 'pushed on reconnect');
  assert.equal((await getUnsyncedSessions(db)).length, 0, 'queue drained');

  // 3. Paranoid replay: send the exact same payload straight at the server
  await api.syncWorkouts(token, [payload]);
  await api.syncWorkouts(token, [payload]);

  // 4. Server truth: exactly one session, delta preserved
  const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/workouts`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const { sessions } = (await res.json()) as { sessions: { id: string; delta: unknown; exercises: { sets: unknown[] }[] }[] };
  assert.equal(sessions.length, 1, 'no duplicates after triple send');
  assert.equal(sessions[0].id, payload.id);
  assert.deepEqual(sessions[0].delta, payload.delta, 'delta preserved verbatim');
  assert.equal(sessions[0].exercises.length, 2);
  assert.equal(sessions[0].exercises.flatMap((e) => e.sets).length, 3);

  console.log('E2E SYNC REHEARSAL PASSED — no duplicates, delta preserved');
  console.log(`(cleanup: test user ${email} left on server; delete if desired)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
