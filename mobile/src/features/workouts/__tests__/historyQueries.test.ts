import { expect, it, vi } from 'vitest';
import type { Database } from '../../../lib/db/database';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { projectWorkoutHistory } from '../historyProjection';
import { readExerciseHistory } from '../historyQueries';
import { setLogId } from '../identity';
import {
  prefill,
  prefillFromSets,
  sessionResults,
  sessionResultsFromSets,
  type WorkoutHistory,
} from '../logic';
import type { SetLog, SetValues, WorkoutSession } from '../types';
import { at, other, session, user } from './fixtures';

const id = (n: number) => `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`;
function workout(n: number, start: number, end: number | null): WorkoutSession {
  const result = {
    ...session(),
    id: id(n),
    startedAt: at(start).toISOString(),
    endedAt: end === null ? null : at(end).toISOString(),
    status: end === null ? ('active' as const) : ('completed' as const),
    updatedAt: at(start).toISOString(),
  };
  result.snapshot.exercises[0]!.logFields = ['reps', 'weight', 'time', 'distance', 'rest', 'done'];
  result.snapshot.exercises[0]!.targetReps = null;
  result.snapshot.exercises[0]!.restSeconds = 0;
  return result;
}
function log(s: WorkoutSession, slot: number, minute: number, values: SetValues): SetLog {
  return {
    id: setLogId(s.id, 0, slot),
    sessionId: s.id,
    exercisePosition: 0,
    setIndex: slot,
    loggedAt: at(minute).toISOString(),
    updatedAt: at(minute).toISOString(),
    logFields: [...s.snapshot.exercises[0]!.logFields],
    values,
  };
}
async function index(db: Database, history: WorkoutHistory[], owner = user) {
  for (const entry of history)
    for (const row of projectWorkoutHistory(entry)) {
      await db.run(
        `INSERT INTO workout_history_index VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          owner,
          row.sessionId,
          row.exerciseId,
          row.completedMs,
          row.loggedMs,
          row.weight,
          row.reps,
          row.time,
          row.distance,
          row.rest,
          row.eligibleWeight,
          row.oneRepMax,
          JSON.stringify(row.log),
        ],
      );
    }
}
async function equivalent(
  db: Database,
  current: WorkoutSession,
  logs: SetLog[],
  history: WorkoutHistory[],
) {
  const prepared = await readExerciseHistory(db, user, current, logs);
  const exercise = current.snapshot.exercises[0]!;
  expect(prefillFromSets(exercise, exercise, prepared)).toEqual(
    prefill(exercise, exercise, history, current.startedAt),
  );
  expect(sessionResultsFromSets(current, logs, prepared)).toEqual(
    sessionResults(current, logs, history),
  );
  return prepared;
}

it('performs no history query for a valid notes-only result', async () => {
  const db = await testDatabase();
  const current = workout(99, 10, null);
  current.snapshot.exercises[0]!.logFields = ['notes', 'done'];
  const actual = [log(current, 0, 11, { notes: 'Completed comfortably', done: true })];
  const read = vi.spyOn(db, 'all');
  expect(await readExerciseHistory(db, user, current, actual)).toEqual([]);
  expect(read).not.toHaveBeenCalled();
});

it('matches full history for latest sparse/zero fields and exact records, excluding future completions and other exercises/accounts', async () => {
  const db = await testDatabase();
  const past = workout(1, 0, 5);
  const different = workout(2, 10, 15);
  different.snapshot.exercises[0]!.exerciseId = 'Other_exercise';
  const overlapping = workout(3, 90, 110);
  const history = [
    {
      session: past,
      logs: [
        log(past, 0, 1, { weight: 40, reps: 6, time: 20, distance: 100 }),
        log(past, 1, 2, { weight: 0, reps: 0, time: 0, distance: 0 }),
        log(past, 2, 3, { reps: 12 }),
      ],
    },
    { session: different, logs: [log(different, 0, 11, { weight: 200, reps: 10, time: 500 })] },
    { session: overlapping, logs: [log(overlapping, 0, 91, { weight: 150, reps: 10 })] },
  ];
  await index(db, history);
  const foreign = workout(66, 0, 5);
  await index(
    db,
    [{ session: foreign, logs: [log(foreign, 0, 1, { weight: 999, reps: 10 })] }],
    other,
  );
  const current = workout(99, 100, null);
  const prepared = await equivalent(
    db,
    current,
    [log(current, 0, 101, { weight: 50, reps: 8, time: 25 })],
    history,
  );
  expect(prepared.every((row) => row.log.sessionId === past.id)).toBe(true);
  expect(
    prefillFromSets(current.snapshot.exercises[0]!, current.snapshot.exercises[0]!, prepared),
  ).toMatchObject({ reps: 12, weight: 0, time: 0, distance: 0, rest: 0 });
});

it('keeps an eligible earlier best when a heavier same-instant result sorts after the candidate', async () => {
  const db = await testDatabase();
  const current = workout(99, 10, null);
  const candidate = log(current, 0, 10, { weight: 50, reps: 8 });
  const options = Array.from({ length: 30 }, (_, n) => workout(n + 1, 0, 10));
  const before = options.find((s) => setLogId(s.id, 0, 0).localeCompare(candidate.id) < 0)!;
  const after = options.find((s) => setLogId(s.id, 0, 0).localeCompare(candidate.id) > 0)!;
  const history = [
    { session: before, logs: [log(before, 0, 10, { weight: 20, reps: 5 })] },
    { session: after, logs: [log(after, 0, 10, { weight: 200, reps: 5 })] },
  ];
  await index(db, history);
  const prepared = await equivalent(db, current, [candidate], history);
  expect(
    sessionResultsFromSets(current, [candidate], prepared).records.find(
      (r) => r.record.metric === 'heaviestWeight',
    )?.record.previousBest,
  ).toBe(20);
});

it('looks up reps at each candidate load, including zero, rather than returning an unrelated best', async () => {
  const db = await testDatabase();
  const past = workout(1, 0, 5);
  const history = [
    {
      session: past,
      logs: [
        log(past, 0, 1, { weight: 0, reps: 5 }),
        log(past, 1, 2, { weight: 25, reps: 10 }),
        log(past, 2, 3, { weight: 50, reps: 20 }),
      ],
    },
  ];
  await index(db, history);
  const current = workout(99, 10, null);
  await equivalent(
    db,
    current,
    [log(current, 0, 11, { weight: 0, reps: 6 }), log(current, 1, 12, { weight: 25, reps: 11 })],
    history,
  );
});
