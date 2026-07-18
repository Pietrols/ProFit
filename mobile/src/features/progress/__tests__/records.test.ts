// AUDIT M2: personal records + week streak.
import { describe, expect, it } from 'vitest';
import { WorkoutSessionPayload } from '../../../data/workoutTypes';
import {
  computeRecords,
  computeWeekStreak,
  detectNewRecords,
  estimateOneRepMax,
} from '../records';

function session(
  startedAt: string,
  sets: { ex: string; reps: number | null; kg: number | null; done?: boolean }[],
): WorkoutSessionPayload {
  return {
    id: `s-${startedAt}-${Math.random()}`,
    planId: null,
    planDayId: null,
    dayName: 'Day',
    category: 'bodybuilding',
    context: 'gym',
    startedAt,
    finishedAt: startedAt,
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
    exercises: Object.entries(
      sets.reduce<Record<string, typeof sets>>((acc, s) => {
        (acc[s.ex] ??= []).push(s);
        return acc;
      }, {}),
    ).map(([ex, ss], i) => ({
      id: `e-${i}`,
      order: i,
      plannedExerciseId: ex,
      actualExerciseId: ex,
      skipped: false,
      sets: ss.map((s, j) => ({
        id: `set-${i}-${j}`,
        setIndex: j,
        plannedReps: null,
        plannedWeightKg: null,
        actualReps: s.reps,
        weightKg: s.kg,
        completed: s.done ?? true,
      })),
    })),
  };
}

describe('estimateOneRepMax (Epley)', () => {
  it('computes and caps reps at 12', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 6)).toBeCloseTo(120);
    expect(estimateOneRepMax(100, 20)).toBeCloseTo(estimateOneRepMax(100, 12));
  });
});

describe('computeRecords / detectNewRecords', () => {
  const prior = [
    session('2026-07-01T10:00:00Z', [
      { ex: 'bench', reps: 8, kg: 60 },
      { ex: 'bench', reps: 5, kg: 70 },
      { ex: 'pushups', reps: 15, kg: null },
      { ex: 'bench', reps: 10, kg: 80, done: false }, // incomplete — ignored
    ]),
  ];

  it('tracks max weight, reps at that weight, max reps, and best e1RM', () => {
    const rec = computeRecords(prior).get('bench')!;
    expect(rec.maxWeightKg).toBe(70);
    expect(rec.maxWeightReps).toBe(5);
    expect(rec.bestE1RmKg).toBeCloseTo(estimateOneRepMax(70, 5));
    expect(computeRecords(prior).get('pushups')!.maxReps).toBe(15);
  });

  it('detects a weight PR and a bodyweight rep PR; no false PRs', () => {
    const prSession = session('2026-07-08T10:00:00Z', [
      { ex: 'bench', reps: 3, kg: 75 }, // weight PR
      { ex: 'pushups', reps: 18, kg: null }, // rep PR
    ]);
    const prs = detectNewRecords(prior, prSession);
    expect(prs).toContainEqual({ exerciseId: 'bench', kind: 'weight', value: 75 });
    expect(prs).toContainEqual({ exerciseId: 'pushups', kind: 'reps', value: 18 });

    const flat = session('2026-07-09T10:00:00Z', [
      { ex: 'bench', reps: 5, kg: 60 },
      { ex: 'pushups', reps: 10, kg: null },
    ]);
    expect(detectNewRecords(prior, flat)).toEqual([]);
  });

  it('a first-ever weighted session counts as a weight PR (nothing to beat)', () => {
    const first = session('2026-07-10T10:00:00Z', [{ ex: 'squat', reps: 5, kg: 80 }]);
    expect(detectNewRecords(prior, first)).toContainEqual({
      exerciseId: 'squat',
      kind: 'weight',
      value: 80,
    });
  });
});

describe('computeWeekStreak', () => {
  const now = new Date('2026-07-15T12:00:00Z'); // Wednesday

  it('counts consecutive weeks back from the current one', () => {
    const sessions = [
      { startedAt: '2026-07-14T10:00:00Z' }, // this week
      { startedAt: '2026-07-07T10:00:00Z' }, // last week
      { startedAt: '2026-06-30T10:00:00Z' }, // 2 weeks ago
      { startedAt: '2026-06-09T10:00:00Z' }, // gap — not counted
    ];
    expect(computeWeekStreak(sessions, now)).toBe(3);
  });

  it('an empty current week does not break the streak (grace)', () => {
    const sessions = [
      { startedAt: '2026-07-07T10:00:00Z' },
      { startedAt: '2026-06-30T10:00:00Z' },
    ];
    expect(computeWeekStreak(sessions, now)).toBe(2);
  });

  it('zero when there are no recent sessions', () => {
    expect(computeWeekStreak([], now)).toBe(0);
    expect(computeWeekStreak([{ startedAt: '2026-05-01T10:00:00Z' }], now)).toBe(0);
  });
});
