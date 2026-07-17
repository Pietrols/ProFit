// Onboarding → starter-template recommendation (Piece 2). Pure and
// deterministic so the mapping is unit-testable.
//
// The goal is always taken directly from the user's answer — never inferred
// from age, experience, or anything else. Age and injuries only decide
// whether the *gentle* variant of a general-fitness start is recommended.

export type OnboardingExperience = 'new' | 'returning' | 'consistent';
export type OnboardingAgeBand = 'under-40' | '40-59' | '60-plus';
export type OnboardingGoal =
  | 'general'
  | 'fat_loss'
  | 'chest_arms_shoulders'
  | 'glutes_legs';

export const INJURY_OPTIONS = [
  'knees',
  'lower back',
  'shoulders',
  'wrists',
  'hips',
] as const;

export interface OnboardingAnswers {
  experience: OnboardingExperience;
  ageBand: OnboardingAgeBand;
  context: 'home' | 'gym';
  goal: OnboardingGoal;
  injuries: string[];
  injuryNote: string;
}

export interface Recommendation {
  templateId: string;
  /** Experience passed to template resolution (regresses ladder exercises). */
  experience: 'beginner' | 'intermediate';
}

const GOAL_TEMPLATES: Record<Exclude<OnboardingGoal, 'general'>, string> = {
  fat_loss: 'fat-loss',
  chest_arms_shoulders: 'chest-arms-shoulders',
  glutes_legs: 'glutes-legs',
};

/** A start where supported, low-strain movements are the safer default. */
export function prefersGentle(a: OnboardingAnswers): boolean {
  return (
    a.ageBand === '60-plus' ||
    (a.experience === 'new' && a.injuries.length > 0)
  );
}

export function recommendTemplate(a: OnboardingAnswers): Recommendation {
  const experience = a.experience === 'consistent' ? 'intermediate' : 'beginner';
  if (a.goal !== 'general') {
    return { templateId: GOAL_TEMPLATES[a.goal], experience };
  }
  if (prefersGentle(a)) {
    return { templateId: 'gentle-start', experience: 'beginner' };
  }
  return {
    templateId: a.context === 'home' ? 'foundations-home' : 'foundations-gym',
    experience,
  };
}
