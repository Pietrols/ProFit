import { describe, expect, it } from 'vitest';
import { finishPatch, isAnswered, skipPatch } from '../onboarding';

describe('finishPatch', () => {
  it('saves every answer and marks onboarding completed', () => {
    expect(finishPatch({ displayName: 'Pete', goal: 'bodybuilding', experience: 'beginner', trainingPlace: 'gym' }, 'Peter')).toEqual({
      displayName: 'Pete',
      goal: 'bodybuilding',
      experience: 'beginner',
      trainingPlace: 'gym',
      onboardingStatus: 'completed',
    });
  });

  it('does not resend the name Google already gave, but still counts it as answered', () => {
    expect(finishPatch({ displayName: 'Peter' }, 'Peter')).toEqual({ onboardingStatus: 'completed' });
  });

  it('marks onboarding skipped when nothing was answered', () => {
    expect(finishPatch({}, 'Peter')).toEqual({ onboardingStatus: 'skipped' });
    expect(finishPatch({ displayName: '   ' }, 'Peter')).toEqual({ onboardingStatus: 'skipped' });
  });

  it('trims the name and keeps it within 60 characters', () => {
    expect(finishPatch({ displayName: '  Pete  ' }, 'Peter').displayName).toBe('Pete');
    expect(finishPatch({ displayName: 'x'.repeat(80) }, 'Peter').displayName).toHaveLength(60);
  });
});

describe('skipPatch', () => {
  it('keeps answers given so far and marks onboarding skipped', () => {
    expect(skipPatch({ goal: 'weight_loss' }, 'Peter')).toEqual({ goal: 'weight_loss', onboardingStatus: 'skipped' });
  });
});

describe('isAnswered', () => {
  it('checks the field that belongs to each step', () => {
    expect(isAnswered('name', { displayName: ' ' })).toBe(false);
    expect(isAnswered('name', { displayName: 'Peter' })).toBe(true);
    expect(isAnswered('goal', { goal: 'athlete' })).toBe(true);
    expect(isAnswered('experience', {})).toBe(false);
    expect(isAnswered('place', { trainingPlace: 'both' })).toBe(true);
  });
});
