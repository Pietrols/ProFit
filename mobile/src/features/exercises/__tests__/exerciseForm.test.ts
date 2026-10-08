import { describe, expect, it } from 'vitest';
import { changeForm, emptyForm, formFor, MAX_PRIMARY, suggestTracking, toggleMuscle, toInput } from '../exerciseForm';
import { placeholderFor } from '../placeholder';
import type { Exercise } from '../types';

describe('custom exercise form', () => {
  it('suggests what each set records from the type and equipment', () => {
    expect(suggestTracking('strength', 'dumbbell')).toBe('weight_reps');
    expect(suggestTracking('strength', 'body only')).toBe('reps');
    expect(suggestTracking('strength', null)).toBe('reps');
    expect(suggestTracking('cardio', 'machine')).toBe('distance_time');
    expect(suggestTracking('cardio', null)).toBe('time');
    expect(suggestTracking('stretching', 'bands')).toBe('time');
  });

  it('follows the suggestion until the user picks tracking, then keeps their choice', () => {
    let s = emptyForm('Sled Push');
    s = changeForm(s, { equipment: 'machine' });
    expect(s.tracking).toBe('weight_reps');
    s = changeForm(s, { tracking: 'distance_time' });
    s = changeForm(s, { equipment: 'body only', category: 'cardio' });
    expect(s).toMatchObject({ tracking: 'distance_time', trackingChosen: true });
  });

  it('keeps a muscle in one list and caps the list size', () => {
    let s = emptyForm();
    s = toggleMuscle(s, 'secondary', 'glutes');
    s = toggleMuscle(s, 'primary', 'glutes');
    expect(s.primary).toEqual(['glutes']);
    expect(s.secondary).toEqual([]);
    for (const m of ['chest', 'lats', 'calves', 'biceps'] as const) s = toggleMuscle(s, 'primary', m);
    expect(s.primary).toHaveLength(MAX_PRIMARY);
    expect(s.primary).not.toContain('biceps');
    s = toggleMuscle(s, 'primary', 'glutes');
    expect(s.primary).not.toContain('glutes');
  });

  it('round-trips an existing exercise and trims what it saves', () => {
    const x: Exercise = {
      id: 'u1', name: 'Tyre Flip', category: 'strongman', equipment: 'other', level: null, force: null, mechanic: null,
      primary: ['glutes'], secondary: ['quadriceps'], instructions: ['Squat down.', 'Drive up.'], tracking: 'reps',
      common: false, popularity: null, origin: 'custom', photoId: 'p1',
    };
    const s = changeForm(formFor(x), { name: '  Tyre Flip  ', instructions: 'Squat down.\nDrive up.\n' });
    expect(toInput(s)).toEqual({
      name: 'Tyre Flip', category: 'strongman', equipment: 'other', primary: ['glutes'], secondary: ['quadriceps'],
      tracking: 'reps', instructions: 'Squat down.\nDrive up.', photoId: 'p1',
    });
  });
});

describe('image placeholder', () => {
  it('picks an icon for the kind of movement and labels it with the main muscle', () => {
    expect(placeholderFor({ category: 'strength', equipment: 'barbell', primary: ['quadriceps'] })).toEqual({ icon: 'barbell', label: 'Quads' });
    expect(placeholderFor({ category: 'strength', equipment: 'exercise ball', primary: ['abdominals'] })).toEqual({ icon: 'body', label: 'Abs' });
    expect(placeholderFor({ category: 'cardio', equipment: 'machine', primary: [] })).toEqual({ icon: 'pulse', label: 'Cardio' });
    expect(placeholderFor({ category: 'plyometrics', equipment: null, primary: ['calves'] }).icon).toBe('flash');
    expect(placeholderFor({ category: 'stretching', equipment: 'bands', primary: ['hamstrings'] }).icon).toBe('resize');
  });
});
