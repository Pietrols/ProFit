// Piece 2 "done when": a beginner choosing home + "build glutes & legs" with
// no injuries is recommended the Glutes & Legs template (resolved for home).
import { describe, expect, it } from 'vitest';
import {
  OnboardingAnswers,
  prefersGentle,
  recommendTemplate,
} from '../recommendTemplate';

const base: OnboardingAnswers = {
  experience: 'new',
  ageBand: 'under-40',
  context: 'home',
  goal: 'general',
  injuries: [],
  injuryNote: '',
};

describe('recommendTemplate', () => {
  it('beginner + home + glutes & legs + no injuries → glutes-legs (done-when)', () => {
    expect(
      recommendTemplate({ ...base, goal: 'glutes_legs' }),
    ).toEqual({ templateId: 'glutes-legs', experience: 'beginner' });
  });

  it('goal is taken directly, never inferred from demographics', () => {
    // a 60+ user asking for glutes & legs gets glutes & legs, not gentle-start
    expect(
      recommendTemplate({ ...base, ageBand: '60-plus', goal: 'glutes_legs' })
        .templateId,
    ).toBe('glutes-legs');
    expect(
      recommendTemplate({ ...base, goal: 'chest_arms_shoulders' }).templateId,
    ).toBe('chest-arms-shoulders');
    expect(recommendTemplate({ ...base, goal: 'fat_loss' }).templateId).toBe(
      'fat-loss',
    );
  });

  it('general goal maps to foundations by context', () => {
    expect(recommendTemplate(base).templateId).toBe('foundations-home');
    expect(recommendTemplate({ ...base, context: 'gym' }).templateId).toBe(
      'foundations-gym',
    );
  });

  it('gentle start for 60+ or brand-new with injuries (general goal only)', () => {
    expect(recommendTemplate({ ...base, ageBand: '60-plus' }).templateId).toBe(
      'gentle-start',
    );
    expect(
      recommendTemplate({ ...base, injuries: ['knees'] }).templateId,
    ).toBe('gentle-start');
    // returning trainee with injuries is not forced gentle
    expect(
      recommendTemplate({ ...base, experience: 'returning', injuries: ['knees'] })
        .templateId,
    ).toBe('foundations-home');
    expect(prefersGentle(base)).toBe(false);
  });

  it('consistent trainees resolve at intermediate (no ladder regression)', () => {
    expect(recommendTemplate({ ...base, experience: 'consistent' }).experience).toBe(
      'intermediate',
    );
    expect(recommendTemplate({ ...base, experience: 'returning' }).experience).toBe(
      'beginner',
    );
  });
});
