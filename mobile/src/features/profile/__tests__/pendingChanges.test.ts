import { describe, expect, it } from 'vitest';
import { applyPatch, isEmptyPatch, mergePatches, parsePatch, remainingAfterSend } from '../pendingChanges';
import type { Me } from '../types';

const me: Me = {
  user: { id: 'u1', email: 'peter@example.com', displayName: 'Peter', avatarUrl: null },
  profile: {
    goal: null,
    experience: null,
    trainingPlace: null,
    unitSystem: 'metric',
    birthYear: null,
    sex: null,
    heightCm: null,
    daysPerWeek: null,
    limitations: null,
    onboardingStatus: 'pending',
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
};

describe('mergePatches', () => {
  it('keeps both edits and lets the newer value win', () => {
    expect(mergePatches({ goal: 'bodybuilding', heightCm: 180 }, { goal: 'athlete', birthYear: 1996 })).toEqual({
      goal: 'athlete',
      heightCm: 180,
      birthYear: 1996,
    });
  });

  it('keeps an explicit null that clears a field', () => {
    expect(mergePatches({ heightCm: 180 }, { heightCm: null })).toEqual({ heightCm: null });
  });
});

describe('applyPatch', () => {
  it('puts the display name on the user and the rest on the profile', () => {
    const shown = applyPatch(me, { displayName: 'Pete', goal: 'powerlifting', onboardingStatus: 'completed' });
    expect(shown.user.displayName).toBe('Pete');
    expect(shown.profile.goal).toBe('powerlifting');
    expect(shown.profile.onboardingStatus).toBe('completed');
  });

  it('changes nothing for an empty patch', () => {
    expect(applyPatch(me, {})).toEqual(me);
  });
});

describe('remainingAfterSend', () => {
  it('empties the queue when nothing changed during the request', () => {
    const queued = { goal: 'athlete' as const, heightCm: 180 };
    expect(isEmptyPatch(remainingAfterSend(queued, queued))).toBe(true);
  });

  it('keeps fields edited again or added while the request was on its way', () => {
    const sent = { goal: 'athlete' as const, heightCm: 180 };
    const queued = { goal: 'powerlifting' as const, heightCm: 180, birthYear: 1996 };
    expect(remainingAfterSend(sent, queued)).toEqual({ goal: 'powerlifting', birthYear: 1996 });
  });
});

describe('parsePatch', () => {
  it('reads a stored patch and ignores anything unreadable', () => {
    expect(parsePatch(JSON.stringify({ goal: 'athlete' }))).toEqual({ goal: 'athlete' });
    expect(parsePatch(null)).toEqual({});
    expect(parsePatch('[1,2]')).toEqual({});
    expect(parsePatch('oops')).toEqual({});
  });
});
