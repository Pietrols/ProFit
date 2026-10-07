import type { Experience, Goal, Me, ProfilePatch, Sex, TrainingPlace, UnitSystem } from './types';

// The profile edit form: what it starts with, how height converts between units, and how typed
// values become a patch. The limits match backend/src/me/schema.ts so the server never has to
// reject what the form accepted.

export const MINIMUM_AGE = 13;
export const HEIGHT_CM = { min: 80, max: 250 } as const;
const CM_PER_INCH = 2.54;

export type ProfileForm = {
  displayName: string;
  goal: Goal | null;
  experience: Experience | null;
  trainingPlace: TrainingPlace | null;
  unitSystem: UnitSystem;
  birthYear: string;
  sex: Sex | null;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  daysPerWeek: number | null;
  limitations: string;
};

export type FormErrors = Partial<Record<'displayName' | 'birthYear' | 'height' | 'limitations', string>>;

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * CM_PER_INCH * 10) / 10;
}

export function formFromMe({ user, profile }: Me): ProfileForm {
  const imperial = profile.heightCm !== null ? cmToFeetInches(profile.heightCm) : null;
  return {
    displayName: user.displayName,
    goal: profile.goal,
    experience: profile.experience,
    trainingPlace: profile.trainingPlace,
    unitSystem: profile.unitSystem,
    birthYear: profile.birthYear?.toString() ?? '',
    sex: profile.sex,
    heightCm: profile.heightCm !== null ? String(Math.round(profile.heightCm)) : '',
    heightFeet: imperial ? String(imperial.feet) : '',
    heightInches: imperial ? String(imperial.inches) : '',
    daysPerWeek: profile.daysPerWeek,
    limitations: profile.limitations ?? '',
  };
}

const wholeNumber = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

// Height in cm from whichever fields the unit system shows. undefined means "invalid".
function readHeight(form: ProfileForm): number | null | undefined {
  if (form.unitSystem === 'metric') {
    if (!form.heightCm.trim()) return null;
    const cm = Number(form.heightCm.trim().replace(',', '.'));
    return Number.isFinite(cm) ? cm : undefined;
  }
  if (!form.heightFeet.trim() && !form.heightInches.trim()) return null;
  const feet = wholeNumber(form.heightFeet || '0');
  const inches = wholeNumber(form.heightInches || '0');
  if (feet === null || inches === null || inches > 11) return undefined;
  return feetInchesToCm(feet, inches);
}

// Checks the form and returns only the fields that changed, ready for updateProfile.
export function validateProfileForm(form: ProfileForm, current: Me, now: Date): { patch: ProfilePatch; errors: FormErrors } {
  const errors: FormErrors = {};
  const patch: ProfilePatch = {};
  const { profile, user } = current;

  const name = form.displayName.trim();
  if (!name) errors.displayName = 'Enter a name.';
  else if (name.length > 60) errors.displayName = 'Keep it to 60 characters.';
  else if (name !== user.displayName) patch.displayName = name;

  const latestYear = now.getFullYear() - MINIMUM_AGE;
  let birthYear: number | null = null;
  if (form.birthYear.trim()) {
    birthYear = wholeNumber(form.birthYear);
    if (birthYear === null || birthYear < 1900 || birthYear > latestYear) {
      errors.birthYear = `Enter a year between 1900 and ${latestYear}. ProFit is for people ${MINIMUM_AGE} and older.`;
    }
  }
  if (!errors.birthYear && birthYear !== profile.birthYear) patch.birthYear = birthYear;

  const height = readHeight(form);
  if (height === undefined || (height !== null && (height < HEIGHT_CM.min || height > HEIGHT_CM.max))) {
    errors.height = form.unitSystem === 'metric' ? 'Enter a height between 80 and 250 cm.' : 'Enter feet and inches (0 to 11), between 2 ft 8 in and 8 ft 2 in.';
  } else if (!sameHeight(height, profile.heightCm)) {
    patch.heightCm = height;
  }

  const limitations = form.limitations.trim();
  if (limitations.length > 500) errors.limitations = 'Keep it to 500 characters.';
  else if ((limitations || null) !== profile.limitations) patch.limitations = limitations || null;

  if (form.goal !== profile.goal) patch.goal = form.goal;
  if (form.experience !== profile.experience) patch.experience = form.experience;
  if (form.trainingPlace !== profile.trainingPlace) patch.trainingPlace = form.trainingPlace;
  if (form.unitSystem !== profile.unitSystem) patch.unitSystem = form.unitSystem;
  if (form.sex !== profile.sex) patch.sex = form.sex;
  if (form.daysPerWeek !== profile.daysPerWeek) patch.daysPerWeek = form.daysPerWeek;

  return { patch: Object.keys(errors).length ? {} : patch, errors };
}

// Converting to feet and inches and back moves a height by a few millimetres; that is not an edit.
function sameHeight(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1.3;
}
