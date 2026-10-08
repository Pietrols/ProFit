import { describe, expect, it } from 'vitest';
import { areaFor } from '../routing';

describe('areaFor', () => {
  it('waits while the stored sign-in is being read', () => {
    expect(areaFor('loading', null)).toBe('loading');
  });

  it('shows sign-in when signed out', () => {
    expect(areaFor('signedOut', null)).toBe('signIn');
  });

  it('shows onboarding only while it is pending', () => {
    expect(areaFor('signedIn', 'pending')).toBe('onboarding');
    expect(areaFor('signedIn', 'completed')).toBe('app');
    expect(areaFor('signedIn', 'skipped')).toBe('app');
  });

  it('goes to the app when the profile has not loaded yet', () => {
    expect(areaFor('signedIn', null)).toBe('app');
  });
});
