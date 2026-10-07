import { describe, expect, it } from 'vitest';
import { cmToFeetInches, feetInchesToCm, formFromMe, validateProfileForm } from '../profileForm';
import type { Me } from '../types';

const NOW = new Date('2026-10-07T10:00:00Z');

const me: Me = {
  user: { id: 'u1', email: 'peter@example.com', displayName: 'Peter', avatarUrl: null },
  profile: {
    goal: 'bodybuilding',
    experience: 'beginner',
    trainingPlace: 'gym',
    unitSystem: 'metric',
    birthYear: 1996,
    sex: null,
    heightCm: 180,
    daysPerWeek: null,
    limitations: null,
    onboardingStatus: 'completed',
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
};

describe('height conversion', () => {
  it('converts both ways', () => {
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(cmToFeetInches(182.9)).toEqual({ feet: 6, inches: 0 });
    expect(feetInchesToCm(5, 11)).toBe(180.3);
  });
});

describe('validateProfileForm', () => {
  it('sends nothing when nothing changed', () => {
    expect(validateProfileForm(formFromMe(me), me, NOW)).toEqual({ patch: {}, errors: {} });
  });

  it('sends only the fields that changed', () => {
    const form = { ...formFromMe(me), displayName: ' Pete ', daysPerWeek: 4, limitations: 'Left knee' };
    expect(validateProfileForm(form, me, NOW).patch).toEqual({ displayName: 'Pete', daysPerWeek: 4, limitations: 'Left knee' });
  });

  it('clears optional details that were emptied', () => {
    const form = { ...formFromMe(me), birthYear: '', heightCm: '', goal: null };
    expect(validateProfileForm(form, me, NOW).patch).toEqual({ birthYear: null, heightCm: null, goal: null });
  });

  it('refuses an empty name, an under-13 birth year and an impossible height', () => {
    const form = { ...formFromMe(me), displayName: '  ', birthYear: '2020', heightCm: '30' };
    const { patch, errors } = validateProfileForm(form, me, NOW);
    expect(patch).toEqual({});
    expect(errors.displayName).toBeDefined();
    expect(errors.birthYear).toMatch(/2013/);
    expect(errors.height).toMatch(/80 and 250 cm/);
  });

  it('reads height in feet and inches when the unit system is imperial', () => {
    const form = { ...formFromMe(me), unitSystem: 'imperial' as const, heightFeet: '6', heightInches: '1' };
    expect(validateProfileForm(form, me, NOW).patch).toEqual({ unitSystem: 'imperial', heightCm: 185.4 });
  });

  it('does not treat the round trip through feet and inches as a height change', () => {
    const form = { ...formFromMe(me), unitSystem: 'imperial' as const };
    expect(validateProfileForm(form, me, NOW).patch).toEqual({ unitSystem: 'imperial' });
  });

  it('rejects 12 or more inches', () => {
    const form = { ...formFromMe(me), unitSystem: 'imperial' as const, heightFeet: '5', heightInches: '12' };
    expect(validateProfileForm(form, me, NOW).errors.height).toBeDefined();
  });
});
