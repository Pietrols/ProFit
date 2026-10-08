// An exercise as the app uses it, whether built in or made by the user.

export const CATEGORIES = ['strength', 'powerlifting', 'olympic weightlifting', 'strongman', 'plyometrics', 'cardio', 'stretching'] as const;
export const EQUIPMENT = ['body only', 'barbell', 'dumbbell', 'kettlebells', 'cable', 'machine', 'bands', 'e-z curl bar', 'medicine ball', 'exercise ball', 'foam roll', 'other'] as const;
export const MUSCLES = [
  'chest', 'shoulders', 'triceps', 'biceps', 'forearms', 'lats', 'middle back', 'lower back', 'traps', 'neck',
  'abdominals', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
] as const;
export const TRACKING = ['weight_reps', 'reps', 'time', 'distance_time'] as const;
export const LEVELS = ['beginner', 'intermediate', 'expert'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type Muscle = (typeof MUSCLES)[number];
export type Tracking = (typeof TRACKING)[number];
export type Level = (typeof LEVELS)[number];

export type Exercise = {
  id: string; // a free-exercise-db slug for built-ins, a UUID for custom exercises
  name: string;
  category: Category;
  equipment: Equipment | null;
  level: Level | null;
  force: 'push' | 'pull' | 'static' | null;
  mechanic: 'compound' | 'isolation' | null;
  primary: Muscle[];
  secondary: Muscle[];
  instructions: string[];
  tracking: Tracking;
  common: boolean;
  popularity: number | null; // 1 = most looked for; null for everything outside the common set
  origin: 'free-exercise-db' | 'profit' | 'custom';
  photoId: string | null; // custom exercises only: the user's photo
};
