import { expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { adjustSession } from '../sessionAdjustments';
import { readStructuredWorkout } from '../structureReads';
import { logStableSet } from '../stableLogging';
import { structuredWorkoutResults } from '../structuredResults';
import { chooseWorkoutSlot } from '../workoutSelection';
import { finishSession, saveSet } from '../workouts';
import { at, other, session, sessionId, set, user } from './fixtures';

it('adapts a busy-gym workout while preserving its routine, original actuals and target snapshots', async () => {
  const db = await testDatabase();
  const original = session();
  original.snapshot.exercises.push({
    ...original.snapshot.exercises[0]!,
    exerciseId: 'Row',
    name: 'Row',
  });
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
  await saveSet(db, user, set(), at(1));
  const read = async () => (await readStructuredWorkout(db, user, sessionId))!;
  let detail = await read();
  const bench = detail.itemView.items[0]!;
  const row = detail.itemView.items[1]!;
  expect(chooseWorkoutSlot(detail, row.id).current?.itemId).toBe(row.id);
  await logStableSet(
    db,
    user,
    {
      item: row,
      setIndex: 0,
      values: { weight: 10, reps: 8 },
      difficulty: 'standard',
      easierToday: false,
    },
    at(2),
  );
  await adjustSession(
    db,
    user,
    sessionId,
    { kind: 'move', item: bench, order: detail.itemView.items, direction: 'later' },
    at(3),
  );
  detail = await read();
  const movedBench = detail.itemView.items.find((item) => item.id === bench.id)!;
  await adjustSession(
    db,
    user,
    sessionId,
    {
      kind: 'change',
      item: movedBench,
      change: { kind: 'state', state: 'skipped', reason: 'Bench occupied' },
    },
    at(3),
  );
  const plankId = '00000000-0000-4000-8000-000000000004';
  const replacementId = '00000000-0000-4000-8000-000000000005';
  await adjustSession(
    db,
    user,
    sessionId,
    {
      kind: 'add',
      id: plankId,
      exercise: {
        ...bench.exercise,
        exerciseId: 'Plank',
        name: 'Plank',
        targetReps: null,
        targetTimeSeconds: 30,
        logFields: ['time'],
      },
    },
    at(4),
  );
  detail = await read();
  const plank = detail.itemView.items.find((item) => item.id === plankId)!;
  await logStableSet(
    db,
    user,
    { item: plank, setIndex: 0, values: { time: 30 }, difficulty: 'standard', easierToday: false },
    at(5),
  );
  await adjustSession(
    db,
    user,
    sessionId,
    {
      kind: 'change',
      item: plank,
      change: { kind: 'targets', targets: { ...plank.exercise, sets: 1 } },
    },
    at(6),
  );
  detail = await read();
  const currentRow = detail.itemView.items.find((item) => item.id === row.id)!;
  await adjustSession(
    db,
    user,
    sessionId,
    {
      kind: 'replace',
      item: currentRow,
      id: replacementId,
      exercise: { ...row.exercise, exerciseId: 'Cable_row', name: 'Cable row', sets: 2 },
    },
    at(7),
  );
  detail = await read();
  const replacement = detail.itemView.items.find((item) => item.id === replacementId)!;
  await logStableSet(
    db,
    user,
    {
      item: replacement,
      setIndex: 0,
      values: { weight: 20, reps: 8 },
      difficulty: 'standard',
      easierToday: false,
    },
    at(8),
  );
  detail = await read();
  expect(detail.session.snapshot).toEqual(original.snapshot);
  expect(detail.resultView.available).toBe(true);
  expect(detail.resultView.results).toHaveLength(4);
  expect(structuredWorkoutResults({ ...detail, previousSets: [] })).toMatchObject({
    volumeKg: 600,
    originalTotal: 6,
    originalCompleted: 2,
    originalOmitted: 4,
    addedCompleted: 2,
    total: 3,
    completed: 2,
  });
  const performedPlank = detail.resultView.results.find((result) => result.itemId === plankId)!;
  expect(performedPlank.targetsAtPerformance?.sets).toBe(3);
  expect(detail.resultView.results[0]!.targetsAtPerformance).toBeNull();
  expect(detail.resultView.results[0]!.log.loggedAt).toBe(at(1).toISOString());
  expect(detail.resultView.results[1]!.exerciseId).toBe('Row');
  expect(detail.itemView.items.find((item) => item.id === bench.id)!.reason).toBe('Bench occupied');
  await finishSession(db, user, sessionId, 'completed', at(10));
  await expect(
    adjustSession(
      db,
      user,
      sessionId,
      { kind: 'add', id: other, exercise: bench.exercise },
      at(11),
    ),
  ).rejects.toThrow('active');
  expect((await read()).session.snapshot).toEqual(original.snapshot);
});
