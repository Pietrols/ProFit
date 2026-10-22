import { describe, expect, it } from 'vitest';
import { comparePerformances, previousWorkoutPerformance } from '../performanceComparison';
import { setLogId } from '../identity';
import type { SetLog } from '../types';
import { at, sessionId, set } from './fixtures';

const log = (
  values: SetLog['values'],
  logFields: SetLog['logFields'] = ['weight', 'reps'],
): SetLog => ({
  ...set(),
  id: setLogId(sessionId, 0, 0),
  updatedAt: at(1).toISOString(),
  values,
  logFields,
});

describe('recent performance differences', () => {
  it('compares reps at exactly the same known load, retaining zero and negative differences', () => {
    expect(
      comparePerformances(log({ weight: 0, reps: 0 }), log({ weight: 0, reps: 8 })).metrics,
    ).toEqual([
      { field: 'weight', value: 0, previous: 0, change: 0 },
      { field: 'reps', value: 0, previous: 8, change: -8 },
    ]);
    expect(
      comparePerformances(log({ weight: 60, reps: 8 }), log({ weight: 50, reps: 10 })).metrics,
    ).toEqual([{ field: 'weight', value: 60, previous: 50, change: 10 }]);
  });

  it('does not treat an absent load as zero or compare weighted and unweighted reps', () => {
    expect(comparePerformances(log({ reps: 10 }), log({ reps: 8 })).metrics).toEqual([]);
    expect(
      comparePerformances(log({ reps: 10 }, ['reps']), log({ weight: 0, reps: 8 })).metrics,
    ).toEqual([]);
    expect(
      comparePerformances(log({ reps: 10 }, ['reps']), log({ reps: 8 }, ['reps'])).metrics,
    ).toEqual([{ field: 'reps', value: 10, previous: 8, change: 2 }]);
  });

  it('compares duration only at a matching known distance and distance only at a matching time', () => {
    const run = (time: number, distance: number) => log({ time, distance }, ['time', 'distance']);
    expect(comparePerformances(run(300, 1000), run(320, 1000)).metrics).toEqual([
      { field: 'time', value: 300, previous: 320, change: -20 },
    ]);
    expect(comparePerformances(run(300, 1200), run(300, 1000)).metrics).toEqual([
      { field: 'distance', value: 1200, previous: 1000, change: 200 },
    ]);
    expect(comparePerformances(run(300, 1200), run(320, 1000)).metrics).toEqual([]);
  });

  it('never reads values outside the chosen fields or compares incomplete entries', () => {
    const current = log({ weight: 60, reps: 10 }, ['reps']);
    const before = structuredClone(current);
    expect(comparePerformances(current, log({ weight: 50, reps: 8 }, ['reps'])).metrics).toEqual([
      { field: 'reps', value: 10, previous: 8, change: 2 },
    ]);
    expect(current).toEqual(before);
    expect(comparePerformances(current, null).reason).toContain('No earlier');
    expect(
      comparePerformances({ ...current, values: { reps: 10, done: false } }, current).metrics,
    ).toEqual([]);
  });
});

it('compares against an earlier visible workout rather than another set in the same workout', () => {
  const entries = [
    { sessionId: 'latest', log: log({ weight: 60, reps: 8 }) },
    { sessionId: 'latest', log: log({ weight: 60, reps: 7 }) },
    { sessionId: 'previous', log: log({ weight: 60, reps: 6 }) },
  ];
  expect(previousWorkoutPerformance(entries, 0)).toBe(entries[2]);
  expect(previousWorkoutPerformance(entries, 1)).toBe(entries[2]);
  expect(previousWorkoutPerformance(entries, 2)).toBeNull();
  expect(previousWorkoutPerformance(entries, -1)).toBeNull();
});
