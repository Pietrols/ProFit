import { z } from 'zod';
import { EXPERIENCE_LEVELS, GOALS, SEXES, TRAINING_PLACES, UNIT_SYSTEMS } from '../db/schema.js';

// ProFit is not for children under 13, so the latest accepted birth year moves with the calendar.
export const MINIMUM_AGE = 13;

// Every field is optional so the app can send only what changed. null clears an optional detail.
// Onboarding can be marked completed or skipped, never set back to pending.
export function profilePatchSchema(now: Date) {
  const latestBirthYear = now.getUTCFullYear() - MINIMUM_AGE;
  return z
    .strictObject({
      displayName: z.string().trim().min(1, 'cannot be empty').max(60).optional(),
      goal: z.enum(GOALS).nullable().optional(),
      experience: z.enum(EXPERIENCE_LEVELS).nullable().optional(),
      trainingPlace: z.enum(TRAINING_PLACES).nullable().optional(),
      unitSystem: z.enum(UNIT_SYSTEMS).optional(),
      birthYear: z.number().int().min(1900).max(latestBirthYear, `must be ${latestBirthYear} or earlier`).nullable().optional(),
      sex: z.enum(SEXES).nullable().optional(),
      heightCm: z.number().min(80).max(250).nullable().optional(),
      daysPerWeek: z.number().int().min(1).max(7).nullable().optional(),
      limitations: z.string().trim().max(500).nullable().optional(),
      onboardingStatus: z.enum(['completed', 'skipped']).optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, 'Send at least one field to change.');
}

export type ProfilePatch = z.infer<ReturnType<typeof profilePatchSchema>>;
