import type { Experience, Goal, ProfilePatch, TrainingPlace } from '../profile/types';

// The first-run questions. Four of them, each one skippable, so a new user is on Home in under a
// minute. Everything else in the profile is filled in later from You.

export const ONBOARDING_STEPS = ['name', 'goal', 'experience', 'place'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingAnswers = {
  displayName?: string;
  goal?: Goal;
  experience?: Experience;
  trainingPlace?: TrainingPlace;
};

// Only what the user actually answered. The name counts as an answer only when it was changed
// from the one Google gave, because that one is already saved.
function answeredFields(answers: OnboardingAnswers, currentName: string): Omit<ProfilePatch, 'onboardingStatus'> {
  const patch: ProfilePatch = {};
  const name = answers.displayName?.trim();
  if (name && name !== currentName) patch.displayName = name.slice(0, 60);
  if (answers.goal) patch.goal = answers.goal;
  if (answers.experience) patch.experience = answers.experience;
  if (answers.trainingPlace) patch.trainingPlace = answers.trainingPlace;
  return patch;
}

// Reaching the end: completed if at least one question was answered, otherwise it was skipped.
export function finishPatch(answers: OnboardingAnswers, currentName: string): ProfilePatch {
  const fields = answeredFields(answers, currentName);
  const answeredAny = Object.keys(fields).length > 0 || !!answers.displayName?.trim();
  return { ...fields, onboardingStatus: answeredAny ? 'completed' : 'skipped' };
}

// "Skip for now": keep whatever was answered so far and go to the app.
export function skipPatch(answers: OnboardingAnswers, currentName: string): ProfilePatch {
  return { ...answeredFields(answers, currentName), onboardingStatus: 'skipped' };
}

// Whether the current step has an answer, which turns its button from "Skip" into "Continue".
export function isAnswered(step: OnboardingStep, answers: OnboardingAnswers): boolean {
  switch (step) {
    case 'name':
      return !!answers.displayName?.trim();
    case 'goal':
      return !!answers.goal;
    case 'experience':
      return !!answers.experience;
    case 'place':
      return !!answers.trainingPlace;
  }
}
