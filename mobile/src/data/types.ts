// Minimal SQL interface the data layer is written against. expo-sqlite's
// SQLiteDatabase satisfies it on device; tests satisfy it with node:sqlite.
export type SqlParam = string | number | null;

export interface DbLike {
  runAsync(sql: string, params?: SqlParam[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  execAsync(sql: string): Promise<void>;
}

export type ExerciseCategory =
  | 'bodybuilding'
  | 'powerlifting'
  | 'crossfit'
  | 'cardio';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  demoUrl: string;
  instructions: string[];
  homeAlternativeId: string | null;
  updatedAt: string;
}

/** Equipment realistically available at home; drives context filtering. */
export const HOME_EQUIPMENT = ['bodyweight', 'dumbbell', 'kettlebell', 'bands'];
