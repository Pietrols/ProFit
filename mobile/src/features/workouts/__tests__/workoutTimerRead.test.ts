import { expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { logStableSet } from '../stableLogging';
import { readStructuredWorkout } from '../structureReads';
import { correctLoggedSet, removeLoggedSet } from '../setCorrections';
import { saveWorkoutTimer, type WorkoutTimerStorage } from '../timerStorage';
import { startTimer } from '../timers';
import { readWorkoutTimer } from '../workoutTimerRead';
import { at, other, session, sessionId, user } from './fixtures';

async function fixture() {
  const db = await testDatabase();
  const original = session();
  await db.run(
    `INSERT INTO workout_sessions VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', '', 0, ?, ?, NULL, 1)`,
    [
      sessionId,
      user,
      user,
      other,
      original.localDate,
      original.startedAt,
      JSON.stringify(original.snapshot),
      original.startedAt,
    ],
  );
  const originalItem = (await readStructuredWorkout(db, user, sessionId))!.itemView.items[0]!;
  const exercise = { ...originalItem.exercise, logFields: ['weight', 'reps', 'done'] };
  await db.run(
    `INSERT INTO session_items VALUES (?, ?, ?, 'added', NULL, NULL, 1, 'active', NULL, ?, ?, NULL, 1)`,
    [other, user, sessionId, JSON.stringify(exercise), originalItem.updatedAt],
  );
  const item = (await readStructuredWorkout(db, user, sessionId))!.itemView.items.find(
    (row) => row.id === other,
  )!;
  const sourceSetId = await logStableSet(
    db,
    user,
    {
      item,
      setIndex: 0,
      values: { weight: 0, reps: 8, done: true },
      difficulty: 'standard',
      easierToday: false,
    },
    at(1),
  );
  const values = new Map<string, string>();
  const store: WorkoutTimerStorage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
  const timer = {
    ...startTimer({ mode: 'rest', seconds: 60 }, at(2).getTime(), user),
    sourceSetId,
  };
  await saveWorkoutTimer(store, user, sessionId, timer);
  const log = (await readStructuredWorkout(db, user, sessionId))!.resultView.results[0]!.log;
  return { db, store, timer, log: { ...log, deletedAt: null } };
}

it('recovers an added-exercise rest timer with no legacy position and keeps it after value correction', async () => {
  const { db, store, timer, log } = await fixture();
  expect(log.exercisePosition).toBeNull();
  expect(await readWorkoutTimer(db, store, user, sessionId)).toEqual(timer);
  await correctLoggedSet(db, user, log, { weight: 20, reps: 8, done: true }, at(3));
  expect(await readWorkoutTimer(db, store, user, sessionId)).toEqual(timer);
  expect(await readWorkoutTimer(db, store, other, sessionId)).toBeNull();
  await db.run("UPDATE workout_sessions SET status = 'completed', ended_at = ?", [
    at(4).toISOString(),
  ]);
  expect(await readWorkoutTimer(db, store, user, sessionId)).toBeNull();
});

it('cancels eligibility for deleted or explicitly incomplete sources', async () => {
  const { db, store, log } = await fixture();
  await correctLoggedSet(db, user, log, { weight: 0, reps: 8, done: false }, at(3));
  expect(await readWorkoutTimer(db, store, user, sessionId)).toBeNull();
  const incomplete = (await readStructuredWorkout(db, user, sessionId))!.resultRecords[0]!;
  await removeLoggedSet(db, user, { ...incomplete, deletedAt: null }, at(4));
  expect(await readWorkoutTimer(db, store, user, sessionId)).toBeNull();
});

it('waits for an unreadable item before recovering an otherwise eligible timer', async () => {
  const { db, store, timer } = await fixture();
  const row = (await db.first<{ exercise: string }>('SELECT exercise FROM session_items'))!;
  await db.run('UPDATE session_items SET exercise = ?', ['invalid']);
  expect(await readWorkoutTimer(db, store, user, sessionId)).toBeNull();
  await db.run('UPDATE session_items SET exercise = ?', [row.exercise]);
  expect(await readWorkoutTimer(db, store, user, sessionId)).toEqual(timer);
});
