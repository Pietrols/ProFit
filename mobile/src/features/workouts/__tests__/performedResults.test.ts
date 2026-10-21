import { expect, it } from 'vitest';
import { setLogId } from '../identity';
import {
  performedResults,
  performedVolume,
  prefillFromSets,
  sessionResultsFromSets,
} from '../logic';
import { sessionItemsView } from '../sessionItemsView';
import { sessionSlotId } from '../structureIdentity';
import { capturePerformanceTargets } from '../structureTargets';
import type { SessionItem, StableSetLog } from '../structureTypes';
import { at, other, session, sessionId, set } from './fixtures';

const parent = () => ({ ...session(), id: sessionId, updatedAt: at(0).toISOString() });
const exercise = parent().snapshot.exercises[0]!;
const log = (index: number, weight: number, reps: number) => ({
  ...set(),
  id: setLogId(sessionId, 0, index),
  setIndex: index,
  values: { weight, reps },
  loggedAt: at(index + 1).toISOString(),
  updatedAt: at(index + 1).toISOString(),
});
const stable = (record: ReturnType<typeof log>): StableSetLog => ({
  ...record,
  itemId: sessionItemsView(parent(), []).items[0]!.id,
  side: 'bilateral',
  targetsAtPerformance: capturePerformanceTargets(exercise, 'standard', false),
});
const row = (record: ReturnType<typeof log> | StableSetLog) => ({
  exerciseId: exercise.exerciseId,
  log: record,
});

it('shares exact metric outputs across legacy and stable records, including zero-valued loads/reps', () => {
  const cases: [number, number][][] = [
    [
      [60, 8],
      [60, 10],
      [70, 5],
    ],
    [
      [0, 8],
      [60, 0],
      [60, 8],
    ],
  ];
  for (const values of cases) {
    const logs = values.map(([weight, reps], index) => log(index, weight, reps));
    const history = [
      {
        ...row(log(0, 55, 8)),
        log: {
          ...log(0, 55, 8),
          id: setLogId(other, 0, 0),
          sessionId: other,
          loggedAt: at(-1).toISOString(),
        },
      },
    ];
    const expected = sessionResultsFromSets(parent(), logs, history);
    const actual = performedResults(parent(), logs.map(stable).map(row).reverse(), history);
    expect(actual.volumeKg).toBe(expected.volumeKg);
    expect(actual.records).toEqual(expected.records);
    expect(performedVolume(logs.map(stable))).toBe(expected.volumeKg);
  }
});

it('retains sparse prefill, zero values and record comparisons for added results with null positions', () => {
  const item: SessionItem = {
    ...sessionItemsView(parent(), []).items[0]!,
    id: other,
    origin: 'added',
    originalPosition: null,
    replacesItemId: null,
  };
  const added = {
    ...stable(log(0, 0, 8)),
    id: sessionSlotId(item, 0),
    itemId: item.id,
    exercisePosition: null,
  };
  const noTargets = { targetReps: null, targetTimeSeconds: null, targetDistanceMetres: null };
  expect(prefillFromSets(exercise, noTargets, [row(added)])).toEqual({ weight: 0, reps: 8 });
  const actual = performedResults(parent(), [row(added)], []);
  expect(actual.volumeKg).toBe(0);
  expect(actual.records.map((record) => record.record.metric)).toEqual(['repsAtWeight']);
});

it('filters invalid, removed and incomplete results and does not mutate caller ordering or history', () => {
  const valid = stable(log(0, 60, 8));
  const removed = { ...stable(log(1, 70, 8)), deletedAt: at(4).toISOString() };
  const incomplete = {
    ...stable(log(2, 80, 8)),
    logFields: ['weight', 'reps', 'done'] as const,
    values: { weight: 80, reps: 8, done: false },
  };
  const history = [row(valid)];
  const before = structuredClone(history);
  expect(
    performedVolume([valid, removed, { ...incomplete, logFields: [...incomplete.logFields] }]),
  ).toBe(480);
  expect(
    performedResults({ ...parent(), status: 'abandoned' }, [row(valid)], history).records,
  ).toEqual([]);
  expect(performedVolume([{ ...valid, side: 'left' } as unknown as StableSetLog])).toBe(0);
  expect(history).toEqual(before);
});
