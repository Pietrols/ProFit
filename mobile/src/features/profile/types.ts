// The account and profile shapes the API sends. They mirror backend/src/me/dto.ts and the enums
// in backend/src/db/schema.ts; when one side changes, change the other in the same commit.

export const GOALS = ['weight_loss', 'bodybuilding', 'calisthenics', 'athlete', 'powerlifting', 'general_fitness'] as const;
export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const TRAINING_PLACES = ['home', 'gym', 'both'] as const;
export const SEXES = ['female', 'male'] as const;
export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export const ONBOARDING_STATUSES = ['pending', 'completed', 'skipped'] as const;

export type Goal = (typeof GOALS)[number];
export type Experience = (typeof EXPERIENCE_LEVELS)[number];
export type TrainingPlace = (typeof TRAINING_PLACES)[number];
export type Sex = (typeof SEXES)[number];
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export type User = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

export type Profile = {
  goal: Goal | null;
  experience: Experience | null;
  trainingPlace: TrainingPlace | null;
  unitSystem: UnitSystem;
  birthYear: number | null;
  sex: Sex | null;
  heightCm: number | null;
  daysPerWeek: number | null;
  limitations: string | null;
  onboardingStatus: OnboardingStatus;
  updatedAt: string;
};

// What PATCH /me accepts: any subset of the editable fields. null clears an optional detail.
export type ProfilePatch = {
  displayName?: string;
  goal?: Goal | null;
  experience?: Experience | null;
  trainingPlace?: TrainingPlace | null;
  unitSystem?: UnitSystem;
  birthYear?: number | null;
  sex?: Sex | null;
  heightCm?: number | null;
  daysPerWeek?: number | null;
  limitations?: string | null;
  onboardingStatus?: 'completed' | 'skipped';
};

export type Me = { user: User; profile: Profile };
