import { describe, expect, it } from 'vitest';
import { formExercise, nextPosition, targetForm } from '../exerciseForm';
import type { PlanExercise } from '../types';
const item: PlanExercise = { id: 'e', dayId: '00000000-0000-4000-8000-000000000001', exerciseId: 'Plank', position: 0, sets: 3, targetReps: null, targetTimeSeconds: 30, targetDistanceMetres: null, restSeconds: 60, logFields: ['time'] };
describe('target form', () => {
  it('preserves empty optional targets and parses edited values', () => {
    const form = targetForm(item); expect(form.reps).toBe(''); expect(form.time).toBe('30');
    expect(formExercise(form, item)).toEqual(item);
    expect(formExercise({ ...form, time: '', reps: '12', distance: '10.5', rest: '0' }, item)).toMatchObject({ targetTimeSeconds: null, targetReps: 12, targetDistanceMetres: 10.5, restSeconds: 0 });
  });
  it('rejects malformed, fractional integer and missing required values', () => {
    for (const patch of [{ sets: '' }, { reps: '1e2' }, { time: '1.5' }, { rest: '-1' }, { distance: 'Infinity' }]) expect(() => formExercise({ ...targetForm(item), ...patch }, item)).toThrow();
  });
  it('appends after the highest position even when there are gaps', () => {
    expect(nextPosition([])).toBe(0); expect(nextPosition([{ position: 4 }, { position: 1 }])).toBe(5);
  });
});
