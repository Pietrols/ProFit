// Phase 5 done-when (computational core): after 3 logged sessions the
// progress numbers are real — strength curve, weekly volume, adherence,
// streaks — and empty inputs produce empty outputs, not fake placeholders.
import { describe, expect, it } from 'vitest';
import { WorkoutSessionPayload, WorkoutSet } from '../../../data/workoutTypes';
import {
  adherence,
  loggedExerciseIds,
  streakWeeks,
  strengthCurve,
  weeklyMuscleVolume,
  weekStartOf,
} from '../computeProgress';

let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`;

function set(weightKg: number | null, completed = true): WorkoutSet {
  return { id: uid(), setIndex: 0, plannedReps: '8-12', plannedWeightKg: null, actualReps: completed ? 8 : null, weightKg, completed };
}

function session(startedAt: string, exercises: { id: string; sets: WorkoutSet[]; skipped?: boolean }[]): WorkoutSessionPayload {
  return {
    id: uid(),
    planId: null,
    planDayId: null,
    dayName: 'Push',
    category: 'bodybuilding',
    context: 'gym',
    startedAt,
    finishedAt: startedAt,
    durationSeconds: 3600,
    delta: {
      plannedExerciseCount: exercises.length,
      completedExerciseCount: exercises.length,
      plannedSetCount: 0,
      completedSetCount: 0,
      skippedExercises: [],
      swappedExercises: [],
      cutShort: false,
    },
    exercises: exercises.map((e, order) => ({
      id: uid(),
      order,
      plannedExerciseId: e.id,
      actualExerciseId: e.id,
      skipped: e.skipped ?? false,
      sets: e.sets,
    })),
  };
}

// Three sessions across two weeks (ref = Fri 2026-07-17)
const REF = new Date('2026-07-17T12:00:00.000Z');
const sessions = [
  session('2026-07-06T09:00:00.000Z', [
    { id: 'barbell-squat', sets: [set(80), set(85), set(90)] },
    { id: 'dumbbell-bench-press', sets: [set(24), set(24), set(24, false)] },
  ]),
  session('2026-07-13T09:00:00.000Z', [
    { id: 'barbell-squat', sets: [set(85), set(90), set(95)] },
    { id: 'side-lateral-raise', sets: [set(10), set(10)], skipped: false },
  ]),
  session('2026-07-15T09:00:00.000Z', [
    { id: 'dumbbell-bench-press', sets: [set(26), set(26)] },
    { id: 'barbell-squat', sets: [set(100)], skipped: false },
  ]),
];

const MUSCLES: Record<string, string[]> = {
  'barbell-squat': ['quadriceps'],
  'dumbbell-bench-press': ['chest'],
  'side-lateral-raise': ['shoulders'],
};
const musclesOf = (id: string) => MUSCLES[id] ?? [];

describe('computeProgress with 3 logged sessions', () => {
  it('builds a real strength curve (top completed set per session)', () => {
    const curve = strengthCurve(sessions, 'barbell-squat');
    expect(curve.map((p) => p.topWeightKg)).toEqual([90, 95, 100]);

    // incomplete sets never count
    const bench = strengthCurve(sessions, 'dumbbell-bench-press');
    expect(bench.map((p) => p.topWeightKg)).toEqual([24, 26]);
  });

  it('lists curve candidates', () => {
    expect(loggedExerciseIds(sessions)).toEqual([
      'barbell-squat',
      'dumbbell-bench-press',
      'side-lateral-raise',
    ]);
  });

  it('computes weekly volume per muscle for the current week only', () => {
    const vol = weeklyMuscleVolume(sessions, musclesOf, REF);
    // week of Jul 13: squat 3+1 sets (quads), bench 2 (chest), laterals 2 (shoulders)
    expect(vol).toEqual([
      { muscle: 'quadriceps', sets: 4 },
      { muscle: 'chest', sets: 2 },
      { muscle: 'shoulders', sets: 2 },
    ]);
  });

  it('computes adherence over trailing weeks', () => {
    // 3 sessions in the trailing 4 weeks vs 2/week planned = 3/8
    const a = adherence(sessions, 2, 4, REF);
    expect(a).toEqual({ completed: 3, planned: 8, pct: 38 });
  });

  it('computes weekly streaks, tolerant of the in-progress week', () => {
    // planned 1/week: current week has 2 (met), previous has 1 (met) → 2
    expect(streakWeeks(sessions, 1, REF)).toBe(2);
    // planned 2/week: current met (2), previous only 1 → 1
    expect(streakWeeks(sessions, 2, REF)).toBe(1);
  });

  it('produces honest empties with no data — no placeholder numbers', () => {
    expect(strengthCurve([], 'barbell-squat')).toEqual([]);
    expect(loggedExerciseIds([])).toEqual([]);
    expect(weeklyMuscleVolume([], musclesOf, REF)).toEqual([]);
    expect(adherence([], 3, 4, REF)).toEqual({ completed: 0, planned: 12, pct: 0 });
    expect(streakWeeks([], 3, REF)).toBe(0);
  });

  it('week bucketing is Monday-anchored', () => {
    expect(weekStartOf(new Date('2026-07-13T00:30:00.000Z'))).toBe('2026-07-13');
    expect(weekStartOf(new Date('2026-07-19T23:00:00.000Z'))).toBe('2026-07-13');
    expect(weekStartOf(new Date('2026-07-12T10:00:00.000Z'))).toBe('2026-07-06');
  });
});
