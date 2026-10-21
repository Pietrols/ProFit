import { describe, expect, it } from 'vitest';
import type { Plan, PlanDay, PlanExercise } from '../../plans/types';
import { setLogId } from '../identity';
import {
  completedSets,
  estimatedOneRepMax,
  lastCompletion,
  personalRecords,
  prefill,
  prefillFromSets,
  sessionResults,
  sessionResultsFromSets,
  sessionSnapshot,
  sessionSummary,
  sessionTargets,
  sessionVolume,
  workoutProgress,
  type ExerciseSet,
  type WorkoutHistory,
} from '../logic';
import type { SetLog, SetValues, WorkoutSession } from '../types';
import { at, session, snapshot } from './fixtures';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function workout(n = 10, start = 0): WorkoutSession {
  const saved = snapshot();
  saved.exercises[0]!.logFields = [
    'reps',
    'weight',
    'time',
    'distance',
    'rest',
    'RPE',
    'notes',
    'done',
  ];
  return {
    ...session(),
    id: id(n),
    startedAt: at(start).toISOString(),
    endedAt: at(start + 10).toISOString(),
    status: 'completed',
    snapshot: saved,
    updatedAt: at(start + 10).toISOString(),
  };
}
function logged(s: WorkoutSession, index: number, values: SetValues, minute = 1): SetLog {
  return {
    id: setLogId(s.id, 0, index),
    sessionId: s.id,
    exercisePosition: 0,
    setIndex: index,
    logFields: [...s.snapshot.exercises[0]!.logFields],
    values,
    loggedAt: at(minute).toISOString(),
    updatedAt: at(minute).toISOString(),
  };
}
const exerciseSet = (log: SetLog, exerciseId = 'Barbell_Bench_Press'): ExerciseSet => ({
  exerciseId,
  log,
});
const historical = (s: WorkoutSession, logs: SetLog[]): WorkoutHistory => ({ session: s, logs });

it('accepts prepared historical results without changing prefills, records or input rows', () => {
  const past = workout(10, 0);
  const current = workout(20, 20);
  const logs = [
    logged(past, 0, { reps: 8, weight: 50 }, 1),
    logged(past, 1, { reps: 5, weight: 55 }, 2),
  ];
  const history = [historical(past, logs)];
  const prepared = logs.map((log) => exerciseSet(log));
  const before = JSON.stringify(prepared);
  const actual = [
    logged(current, 0, { reps: 8, weight: 60 }, 21),
    logged(current, 1, { reps: 10, weight: 60 }, 22),
  ];
  expect(sessionResultsFromSets(current, actual, prepared)).toEqual(
    sessionResults(current, actual, history),
  );
  const exercise = current.snapshot.exercises[0]!;
  expect(prefillFromSets(exercise, exercise, prepared)).toEqual(
    prefill(exercise, exercise, history, current.startedAt),
  );
  expect(JSON.stringify(prepared)).toBe(before);
});

describe('workout snapshots and targets', () => {
  const plan: Plan = {
    id: id(1),
    name: 'Cycle',
    shape: 'cycle',
    difficulty: 'hard',
    active: true,
    updatedAt: at(0).toISOString(),
  };
  const day: PlanDay = {
    id: id(2),
    planId: id(1),
    name: 'A',
    position: 0,
    weekday: null,
    restDay: false,
  };
  const exercise = (n: number, position: number): PlanExercise => ({
    id: id(n),
    dayId: day.id,
    exerciseId: `Lift_${n}`,
    position,
    sets: 3,
    targetReps: 8,
    targetTimeSeconds: null,
    targetDistanceMetres: null,
    restSeconds: 60,
    logFields: ['reps', 'weight'],
  });
  it('sorts by position and id, scopes by day and copies selected fields', () => {
    const rows = [exercise(4, 1), exercise(3, 1), { ...exercise(5, 0), dayId: id(99) }];
    const names = new Map([
      ['Lift_3', 'First'],
      ['Lift_4', 'Second'],
    ]);
    const saved = sessionSnapshot(plan, day, rows, names);
    expect(saved.exercises.map((e) => e.name)).toEqual(['First', 'Second']);
    expect(saved.difficulty).toBe('hard');
    expect(rows[0]!.id).toBe(id(4));
    rows[1]!.logFields.push('notes');
    rows[1]!.targetReps = 15;
    names.set('Lift_3', 'Renamed');
    expect(saved.exercises[0]).toMatchObject({
      name: 'First',
      targetReps: 8,
      logFields: ['reps', 'weight'],
    });
  });
  it('rest days have no exercises and missing exercise names block starting', () => {
    expect(
      sessionSnapshot(plan, { ...day, restDay: true }, [exercise(3, 0)], new Map()).exercises,
    ).toEqual([]);
    expect(() => sessionSnapshot(plan, day, [exercise(3, 0)], new Map())).toThrow('unavailable');
    expect(() => sessionSnapshot(plan, day, [], new Map())).toThrow();
    expect(() => sessionSnapshot(plan, { ...day, planId: id(99) }, [], new Map())).toThrow(
      'this plan',
    );
  });
  it('scales from Standard on every call and preserves the saved targets', () => {
    const e = workout().snapshot.exercises[0]!;
    expect(sessionTargets(e, 'hard', false).targetReps).toBe(10);
    expect(sessionTargets(e, 'hard', true).targetReps).toBe(6);
    expect(sessionTargets(e, 'hard', false).targetReps).toBe(10);
    expect(e.targetReps).toBe(8);
    expect(e.restSeconds).toBe(60);
    expect(e.sets).toBe(3);
  });
});

describe('completed sets, progress and volume', () => {
  it('counts each valid slot once and chooses its latest edit independently of input order', () => {
    const s = workout();
    const first = logged(s, 0, { reps: 8, weight: 10 });
    const edited = { ...first, updatedAt: at(3).toISOString(), values: { reps: 6, weight: 20 } };
    const third = logged(s, 2, { done: true });
    for (const rows of [
      [first, third, edited],
      [edited, first, third],
    ]) {
      expect(completedSets(s, rows).map((l) => l.values)).toEqual([
        { reps: 6, weight: 20 },
        { done: true },
      ]);
      expect(workoutProgress(s, rows)).toEqual({
        total: 3,
        completed: 2,
        next: { exercisePosition: 0, setIndex: 1 },
      });
      expect(sessionVolume(s, rows)).toBe(120);
    }
  });
  it('a newer tombstone or incomplete value suppresses the older completed copy', () => {
    const s = workout();
    const old = logged(s, 0, { reps: 8, weight: 45 });
    const removed = { ...old, updatedAt: at(2).toISOString(), deletedAt: at(2).toISOString() };
    const incomplete = {
      ...old,
      updatedAt: at(2).toISOString(),
      values: { reps: 8, weight: 45, done: false },
    };
    expect(completedSets(s, [removed, old])).toEqual([]);
    expect(completedSets(s, [old, incomplete])).toEqual([]);
    expect(completedSets(s, [old, { ...old, deletedAt: at(1).toISOString() }])).toEqual([]);
  });
  it('ignores foreign sessions, impossible slots, hidden fields and out-of-session times', () => {
    const s = workout();
    const good = logged(s, 0, { reps: 8, weight: 45 });
    const bad: SetLog[] = [
      { ...good, sessionId: id(99) },
      { ...good, exercisePosition: 1 },
      { ...good, setIndex: 3 },
      { ...good, id: id(98) },
      { ...good, logFields: ['reps'], values: { reps: 8, weight: 45 } },
      { ...good, loggedAt: at(-1).toISOString() },
      { ...good, loggedAt: at(11).toISOString() },
      { ...good, values: { reps: NaN } },
    ];
    for (const row of bad) expect(sessionVolume(s, [row])).toBe(0);
    expect(completedSets({ ...s, deletedAt: at(20).toISOString() }, [good])).toEqual([]);
  });
  it('does not estimate missing weight and counts zero reps as zero volume', () => {
    const s = workout();
    const rows = [
      logged(s, 0, { reps: 20 }),
      logged(s, 1, { reps: 0, weight: 100 }),
      logged(s, 2, { reps: 5, weight: 12.5 }),
    ];
    expect(sessionVolume(s, rows)).toBe(62.5);
    expect(workoutProgress(s, rows)).toEqual({ total: 3, completed: 3, next: null });
  });
  it('handles a rest day and repeated exercises as separate slots', () => {
    const s = workout();
    s.snapshot.exercises.push({ ...s.snapshot.exercises[0]!, sets: 1 });
    const second = {
      ...logged(s, 0, { reps: 5, weight: 20 }),
      exercisePosition: 1,
      id: setLogId(s.id, 1, 0),
    };
    expect(sessionVolume(s, [logged(s, 0, { reps: 8, weight: 20 }), second])).toBe(260);
    expect(workoutProgress(s, [second])).toEqual({
      total: 4,
      completed: 1,
      next: { exercisePosition: 0, setIndex: 0 },
    });
    s.snapshot = { ...s.snapshot, restDay: true, exercises: [] };
    expect(workoutProgress(s, [])).toEqual({ total: 0, completed: 0, next: null });
  });
});

describe('prefill', () => {
  it('uses plan targets first and the last recorded value independently for other selected fields', () => {
    const s = workout();
    const e = {
      ...s.snapshot.exercises[0]!,
      targetTimeSeconds: 30,
      targetDistanceMetres: null,
      restSeconds: 0,
    };
    const history = [
      historical(s, [
        logged(s, 0, { weight: 45, distance: 800 }),
        logged(s, 1, { reps: 12, weight: 0, time: 90, RPE: 9, notes: 'Old', done: true }, 2),
      ]),
    ];
    expect(prefill(e, sessionTargets(e, 'standard', false), history, at(20).toISOString())).toEqual(
      { reps: 8, weight: 0, time: 30, distance: 800, rest: 0 },
    );
    expect(
      prefill(
        { ...e, logFields: ['weight'] },
        sessionTargets(e, 'standard', false),
        history,
        at(20).toISOString(),
      ),
    ).toEqual({ weight: 0 });
  });
  it('leaves unknown weight blank and never prefills notes, effort or done', () => {
    const e = workout().snapshot.exercises[0]!;
    expect(prefill(e, sessionTargets(e, 'standard', false), [], at(20).toISOString())).toEqual({
      reps: 8,
      rest: 60,
    });
    expect(
      prefill(
        { ...e, logFields: ['done', 'notes', 'RPE'] },
        sessionTargets(e, 'standard', false),
        [],
        at(20).toISOString(),
      ),
    ).toEqual({});
  });
  it('ignores active, abandoned, deleted, future and other-exercise history', () => {
    const s = workout();
    const e = s.snapshot.exercises[0]!;
    const row = logged(s, 0, { weight: 99 });
    const different = workout(11);
    different.snapshot.exercises[0]!.exerciseId = 'Plank';
    const history: WorkoutHistory[] = [
      historical({ ...s, status: 'active', endedAt: null }, [row]),
      historical({ ...s, status: 'abandoned' }, [row]),
      { session: { ...s, deletedAt: at(11).toISOString() }, logs: [row] },
      historical({ ...s, endedAt: at(30).toISOString() }, [row]),
      historical(different, [logged(different, 0, { weight: 100 })]),
    ];
    expect(
      prefill(e, sessionTargets(e, 'standard', false), history, at(20).toISOString()).weight,
    ).toBeUndefined();
  });
  it('compares timestamps as instants, not ISO string order, with a stable id tie break', () => {
    const s = workout();
    const a = logged(s, 0, { weight: 10 });
    const b = { ...logged(s, 1, { weight: 20 }, 2), loggedAt: '2026-10-09T08:02:00-01:00' };
    const e = s.snapshot.exercises[0]!;
    const targets = sessionTargets(e, 'standard', false);
    expect(prefill(e, targets, [historical(s, [a, b])], at(20).toISOString()).weight).toBe(20);
    const tied = { ...b, loggedAt: a.loggedAt };
    const expected = a.id.localeCompare(tied.id) > 0 ? 10 : 20;
    expect(prefill(e, targets, [historical(s, [tied, a])], at(20).toISOString()).weight).toBe(
      expected,
    );
  });
});

describe('personal records', () => {
  it.each([
    [100, 1, 100],
    [60, 5, 70],
    [90, 10, 120],
  ])('estimates %s kg for %s reps', (kg, reps, expected) => {
    expect(estimatedOneRepMax(kg, reps)).toBeCloseTo(expected);
  });
  it.each([
    [0, 1],
    [-1, 3],
    [Infinity, 2],
    [2001, 1],
    [50, 0],
    [50, 11],
    [50, 2.5],
    [NaN, 4],
  ])('rejects invalid estimate %s, %s', (kg, reps) => {
    expect(estimatedOneRepMax(kg, reps)).toBeNull();
  });
  it('reports all four first records and compares unrounded values', () => {
    const s = workout();
    const row = logged(s, 0, { weight: 60, reps: 5, time: 30 });
    expect(personalRecords(exerciseSet(row), [])).toEqual([
      { metric: 'heaviestWeight', value: 60, previousBest: null },
      { metric: 'repsAtWeight', value: 5, previousBest: null, weightKg: 60 },
      { metric: 'estimatedOneRepMax', value: 70, previousBest: null },
      { metric: 'longestTime', value: 30, previousBest: null },
    ]);
    const improved = logged(s, 1, { weight: 60.001 }, 2);
    expect(personalRecords(exerciseSet(improved), [exerciseSet(row)])[0]!.value).toBe(60.001);
  });
  it('ties are not PRs and most reps compares the exact same weight', () => {
    const s = workout();
    const first = logged(s, 0, { weight: 50, reps: 8, time: 60 });
    const equal = logged(s, 1, { weight: 50, reps: 8, time: 60 }, 2);
    expect(personalRecords(exerciseSet(equal), [exerciseSet(first)])).toEqual([]);
    const more = logged(s, 2, { weight: 50, reps: 9, time: 65 }, 3);
    expect(
      personalRecords(exerciseSet(more), [exerciseSet(first)]).map((r) => [
        r.metric,
        r.previousBest,
      ]),
    ).toEqual([
      ['repsAtWeight', 8],
      ['estimatedOneRepMax', 50 * (1 + 8 / 30)],
      ['longestTime', 60],
    ]);
    expect(
      personalRecords(exerciseSet({ ...more, values: { weight: 49, reps: 1 } }), [
        exerciseSet(first),
      ]),
    ).toEqual([{ metric: 'repsAtWeight', value: 1, previousBest: null, weightKg: 49 }]);
  });
  it('zero reps do not create load records; bodyweight, time-only and done-only remain honest', () => {
    const s = workout();
    expect(personalRecords(exerciseSet(logged(s, 0, { weight: 100, reps: 0 })), [])).toEqual([]);
    expect(personalRecords(exerciseSet(logged(s, 0, { reps: 20 })), [])).toEqual([]);
    expect(personalRecords(exerciseSet(logged(s, 0, { weight: 0, reps: 20 })), [])).toEqual([
      { metric: 'repsAtWeight', value: 20, previousBest: null, weightKg: 0 },
    ]);
    expect(personalRecords(exerciseSet(logged(s, 0, { time: 45 })), [])).toEqual([
      { metric: 'longestTime', value: 45, previousBest: null },
    ]);
    expect(personalRecords(exerciseSet(logged(s, 0, { done: true })), [])).toEqual([]);
  });
  it('excludes future, foreign exercise, deleted and incomplete comparisons', () => {
    const s = workout();
    const candidate = logged(s, 1, { weight: 40 }, 2);
    const older = logged(s, 0, { weight: 100 });
    const previous: ExerciseSet[] = [
      exerciseSet({ ...older, loggedAt: at(3).toISOString() }),
      exerciseSet(older, 'Plank'),
      exerciseSet({ ...older, deletedAt: at(2).toISOString() } as SetLog),
      exerciseSet({ ...older, values: { weight: 100, done: false } }),
    ];
    expect(personalRecords(exerciseSet(candidate), previous)).toEqual([
      { metric: 'heaviestWeight', value: 40, previousBest: null },
    ]);
    expect(
      personalRecords(exerciseSet({ ...candidate, values: { weight: 40, done: false } }), []),
    ).toEqual([]);
  });
});

describe('session summary and completion', () => {
  it('compares earlier completed history and earlier sets, and recomputes after an edit', () => {
    const old = workout();
    const current = workout(11, 20);
    const history = [historical(old, [logged(old, 0, { weight: 40, reps: 5 })])];
    const first = logged(current, 0, { weight: 45, reps: 5 }, 21);
    const second = logged(current, 1, { weight: 45, reps: 5 }, 22);
    const summary = sessionSummary(current, [second, first], history, at(40).toISOString());
    expect(summary).toMatchObject({ completed: 2, total: 3, elapsedSeconds: 600, volumeKg: 450 });
    expect(summary.records).toHaveLength(3);
    expect(summary.records.every((r) => r.setId === first.id)).toBe(true);
    const edited = { ...first, values: { weight: 35, reps: 5 }, updatedAt: at(25).toISOString() };
    expect(
      sessionSummary(current, [edited, second], history, at(40).toISOString()).records.filter(
        (r) => r.record.metric === 'heaviestWeight',
      ),
    ).toEqual([
      {
        setId: second.id,
        exerciseId: 'Barbell_Bench_Press',
        record: { metric: 'heaviestWeight', value: 45, previousBest: 40 },
      },
    ]);
  });
  it('supports live PR feedback but excludes abandoned sessions and later history from baselines', () => {
    const current = workout();
    const active = { ...current, status: 'active' as const, endedAt: null };
    const logs = [logged(active, 0, { weight: 50 })];
    const later = workout(12, 20);
    const history = [
      historical(later, [logged(later, 0, { weight: 200 }, 21)]),
      historical({ ...current, status: 'abandoned' }, logs),
    ];
    expect(sessionSummary(active, logs, history, at(3).toISOString())).toMatchObject({
      elapsedSeconds: 180,
      records: [{ record: { previousBest: null } }],
    });
    expect(
      sessionSummary({ ...current, status: 'abandoned' }, logs, [], at(3).toISOString()).records,
    ).toEqual([]);
    expect(sessionSummary(active, [], [], at(-1).toISOString()).elapsedSeconds).toBe(0);
  });
  it('chooses completed sessions by end time, preserves local start date, and ignores other plans', () => {
    const a = { ...workout(), localDate: '2026-10-08' };
    const b = { ...workout(11, 20), dayId: id(9) };
    const active = { ...workout(12, 40), status: 'active' as const, endedAt: null };
    expect(lastCompletion(a.planId, [b, active, a])).toEqual({
      planId: a.planId,
      dayId: b.dayId,
      date: b.localDate,
    });
    expect(
      lastCompletion(a.planId, [
        a,
        { ...b, status: 'abandoned' },
        { ...b, deletedAt: at(40).toISOString() },
        { ...b, planId: id(99) },
      ]),
    ).toEqual({ planId: a.planId, dayId: a.dayId, date: '2026-10-08' });
    expect(lastCompletion(id(99), [a])).toBeNull();
  });
  it('does not mutate supplied session, history or logs', () => {
    const s = workout();
    const logs = [logged(s, 1, { weight: 45, reps: 5 }, 2), logged(s, 0, { weight: 40, reps: 5 })];
    const before = JSON.stringify({ s, logs });
    sessionSummary(s, logs, [], at(20).toISOString());
    prefill(
      s.snapshot.exercises[0]!,
      sessionTargets(s.snapshot.exercises[0]!, 'hard', true),
      [historical(s, logs)],
      at(20).toISOString(),
    );
    expect(JSON.stringify({ s, logs })).toBe(before);
  });
});
