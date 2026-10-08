import type { Profile, User } from '../db/schema.js';

// What the API sends about a user. Internal columns (Google account id, timestamps) stay private.
export function userDto(user: User) {
  return { id: user.id, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl };
}

export function profileDto(profile: Profile) {
  return {
    goal: profile.goal,
    experience: profile.experience,
    trainingPlace: profile.trainingPlace,
    unitSystem: profile.unitSystem,
    birthYear: profile.birthYear,
    sex: profile.sex,
    heightCm: profile.heightCm,
    daysPerWeek: profile.daysPerWeek,
    limitations: profile.limitations,
    onboardingStatus: profile.onboardingStatus,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export type UserDto = ReturnType<typeof userDto>;
export type ProfileDto = ReturnType<typeof profileDto>;
