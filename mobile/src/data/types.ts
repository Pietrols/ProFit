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

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'push'
  | 'pull'
  | 'core'
  | 'carry'
  | 'cardio'
  | 'balance';

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
  // Progression ladder (Piece 1): pattern + tier (1 low – 4 high) and links
  // to the sibling one tier down/up within the same pattern.
  movementPattern: MovementPattern | null;
  difficultyTier: number | null;
  easierVariantId: string | null;
  harderVariantId: string | null;
  updatedAt: string;
}

/** Equipment realistically available at home; drives context filtering. */
export const HOME_EQUIPMENT = ['bodyweight', 'dumbbell', 'kettlebell', 'bands'];
