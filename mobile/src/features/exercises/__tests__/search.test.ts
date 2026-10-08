import { describe, expect, it } from 'vitest';
import { builtInExercise, builtInExercises } from '../library';
import { searchExercises } from '../search';
import type { Exercise } from '../types';

const library = builtInExercises();
const names = (list: Exercise[], n = 3) => list.slice(0, n).map((x) => x.name);

const custom: Exercise = {
  id: '6a3e0f0e-1111-4222-8333-944455566677',
  name: 'Sandbag Squat',
  category: 'strength',
  equipment: 'other',
  level: null,
  force: null,
  mechanic: null,
  primary: ['quadriceps'],
  secondary: ['glutes'],
  instructions: [],
  tracking: 'weight_reps',
  common: false,
  popularity: null,
  origin: 'custom',
  photoId: null,
};

describe('the bundled library', () => {
  it('has the built-in exercises with tracking types and every common staple', () => {
    expect(library.length).toBeGreaterThan(850);
    expect(builtInExercise('Barbell_Squat')).toMatchObject({ name: 'Barbell Squat', tracking: 'weight_reps', common: true });
    expect(builtInExercise('Plank')?.tracking).toBe('time');
    expect(builtInExercise('Pullups')).toMatchObject({ name: 'Pull-Up', tracking: 'reps' });
    expect(builtInExercise('ProFit_Burpee')?.origin).toBe('profit');
    expect(new Set(library.map((x) => x.id)).size).toBe(library.length);
  });
});

describe('searchExercises', () => {
  it('puts the plainest common match first', () => {
    expect(names(searchExercises(library, 'bench press'))[0]).toBe('Barbell Bench Press');
    expect(names(searchExercises(library, 'squat'), 1)).toEqual(['Barbell Squat']);
  });

  it('finds names typed without hyphens or spaces', () => {
    expect(names(searchExercises(library, 'pushup'), 1)).toEqual(['Push-Up']);
    expect(names(searchExercises(library, 'pull up'), 1)).toEqual(['Pull-Up']);
  });

  it('expands gym shorthand', () => {
    expect(searchExercises(library, 'db row').some((x) => x.id === 'One-Arm_Dumbbell_Row')).toBe(true);
    expect(searchExercises(library, 'rdl')[0]?.id).toBe('Romanian_Deadlift');
  });

  it('matches muscles and equipment as well as names', () => {
    const results = searchExercises(library, 'quads kettlebell');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((x) => x.equipment === 'kettlebells')).toBe(true);
  });

  it('applies filters, including favourites', () => {
    const chestMachines = searchExercises(library, '', { muscle: 'chest', equipment: 'machine' });
    expect(chestMachines.length).toBeGreaterThan(0);
    expect(chestMachines.every((x) => x.primary.includes('chest') && x.equipment === 'machine')).toBe(true);
    expect(searchExercises(library, '', { favouritesOnly: true }, new Set(['Plank'])).map((x) => x.id)).toEqual(['Plank']);
    expect(searchExercises(library, '', { category: 'cardio' }).every((x) => x.category === 'cardio')).toBe(true);
  });

  it('lists the user’s own and common exercises first when there is no query', () => {
    const results = searchExercises([...library, custom], '');
    expect(results[0]).toBe(custom);
    expect(results.slice(1, 92).every((x) => x.common)).toBe(true);
  });

  it('returns nothing for a word nothing contains', () => {
    expect(searchExercises(library, 'zzzz')).toEqual([]);
  });
});
