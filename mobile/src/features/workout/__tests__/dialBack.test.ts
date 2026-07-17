// Piece 4 "done when" (per-session half): the dial-back transforms only the
// day handed to the session — bodyweight swaps one tier down, sets/reps come
// down — and the original plan day object is untouched.
import { describe, expect, it } from 'vitest';
import { PlanDay } from '../../../data/planRepo';
import { Exercise } from '../../../data/types';
import { dialBackDay, reduceReps } from '../dialBack';

const ex = (id: string, extra: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id,
  category: 'bodybuilding',
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: ['bodyweight'],
  demoUrl: `https://x/${id}.jpg`,
  instructions: [],
  homeAlternativeId: null,
  movementPattern: null,
  difficultyTier: null,
  easierVariantId: null,
  harderVariantId: null,
  updatedAt: '2026-07-17T00:00:00.000Z',
  ...extra,
});

const pushups = ex('pushups', {
  movementPattern: 'push',
  difficultyTier: 3,
  easierVariantId: 'incline-push-up',
  harderVariantId: 'decline-push-up',
});
const incline = ex('incline-push-up', {
  movementPattern: 'push',
  difficultyTier: 2,
  easierVariantId: 'wall-push-up',
  harderVariantId: 'pushups',
});
const curls = ex('dumbbell-curls', { equipment: ['dumbbell'] }); // not laddered

const library = new Map([
  ['pushups', pushups],
  ['incline-push-up', incline],
  ['dumbbell-curls', curls],
]);
const lookup = (id: string) => library.get(id) ?? null;

const day: PlanDay = {
  id: 'd1',
  dayIndex: 0,
  name: 'Full Body A',
  category: 'bodybuilding',
  exercises: [
    {
      id: 'pe1',
      order: 0,
      exerciseId: 'pushups',
      sets: 3,
      reps: '10-15',
      restSeconds: 75,
      exercise: pushups,
    },
    {
      id: 'pe2',
      order: 1,
      exerciseId: 'dumbbell-curls',
      sets: 3,
      reps: '12',
      restSeconds: 60,
      exercise: curls,
    },
  ],
};

describe('dialBackDay', () => {
  it('swaps laddered exercises one tier down and trims sets/reps', () => {
    const eased = dialBackDay(day, lookup);
    expect(eased.exercises[0].exerciseId).toBe('incline-push-up');
    expect(eased.exercises[0].exercise.name).toBe('incline-push-up');
    expect(eased.exercises[0].sets).toBe(2);
    expect(eased.exercises[0].reps).toBe('8-11');
  });

  it('leaves non-laddered exercises in place (sets/reps still ease off)', () => {
    const eased = dialBackDay(day, lookup);
    expect(eased.exercises[1].exerciseId).toBe('dumbbell-curls');
    expect(eased.exercises[1].sets).toBe(2);
    expect(eased.exercises[1].reps).toBe('9');
  });

  it('never mutates the original day — the saved plan stays unchanged', () => {
    const snapshot = JSON.parse(JSON.stringify(day));
    dialBackDay(day, lookup);
    expect(day).toEqual(snapshot);
  });

  it('sets never drop below 1; non-numeric reps pass through', () => {
    const single: PlanDay = {
      ...day,
      exercises: [{ ...day.exercises[0], sets: 1, reps: 'hold' }],
    };
    const eased = dialBackDay(single, lookup);
    expect(eased.exercises[0].sets).toBe(1);
    expect(eased.exercises[0].reps).toBe('hold');
  });

  it('reduceReps scales numeric prescriptions only', () => {
    expect(reduceReps('8-12')).toBe('6-9');
    expect(reduceReps('5')).toBe('4');
    expect(reduceReps('AMRAP 12 min')).toBe('AMRAP 12 min');
    expect(reduceReps('1 min brisk / 2 min easy')).toBe('1 min brisk / 2 min easy');
  });
});
