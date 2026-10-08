import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { customExercises, exerciseFavourites, weightEntries } from '../db/schema.js';

// The tables phones sync, and how each record looks on the wire. Adding a synced feature later means
// adding one entry here: a table with the sync columns, a Zod schema, and the two mappings.
// Mirrored on the phone in mobile/src/features/sync/collections.ts.

const isoTime = z.iso.datetime({ offset: true });

// A calendar date as the phone saw it (YYYY-MM-DD), checked to be a real day.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-07')
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
  }, 'is not a real date');

const syncFields = {
  id: z.uuid(),
  updatedAt: isoTime,
  deletedAt: isoTime.nullable(),
};

// The exercise vocabulary. Matches mobile/src/features/exercises/types.ts.
export const CATEGORIES = ['strength', 'powerlifting', 'olympic weightlifting', 'strongman', 'plyometrics', 'cardio', 'stretching'] as const;
export const EQUIPMENT = ['body only', 'barbell', 'dumbbell', 'kettlebells', 'cable', 'machine', 'bands', 'e-z curl bar', 'medicine ball', 'exercise ball', 'foam roll', 'other'] as const;
export const MUSCLES = [
  'chest', 'shoulders', 'triceps', 'biceps', 'forearms', 'lats', 'middle back', 'lower back', 'traps', 'neck',
  'abdominals', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
] as const;
export const TRACKING = ['weight_reps', 'reps', 'time', 'distance_time'] as const;

export const weightRecord = z.strictObject({
  ...syncFields,
  date: calendarDate,
  weightKg: z.number().min(20).max(400),
  note: z.string().trim().max(200).nullable(),
});

export const customExerciseRecord = z.strictObject({
  ...syncFields,
  name: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES),
  equipment: z.enum(EQUIPMENT).nullable(),
  primaryMuscles: z.array(z.enum(MUSCLES)).min(1).max(4),
  secondaryMuscles: z.array(z.enum(MUSCLES)).max(6),
  tracking: z.enum(TRACKING),
  instructions: z.string().trim().max(2000).nullable(),
  photoId: z.uuid().nullable(),
});

// Built-in ids are dataset slugs (letters, digits, - and _); custom ones are UUIDs.
export const favouriteRecord = z.strictObject({
  ...syncFields,
  exerciseId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'must be an exercise id'),
});

export type WeightRecord = z.infer<typeof weightRecord>;
export type CustomExerciseRecord = z.infer<typeof customExerciseRecord>;
export type FavouriteRecord = z.infer<typeof favouriteRecord>;

type SyncRow = { id: string; updatedAt: Date; deletedAt: Date | null };

export type CollectionSpec<R, Row extends SyncRow> = {
  table: PgTable;
  schema: z.ZodType<R>;
  // Wire record -> table columns (without the sync columns, which the service fills in).
  toRow: (record: R) => Record<string, unknown>;
  // Table row -> wire record.
  toWire: (row: Row) => R;
};

const syncWire = (row: SyncRow) => ({
  id: row.id,
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
});

function define<R, Row extends SyncRow>(spec: CollectionSpec<R, Row>) {
  return spec;
}

export const collections = {
  weight_entries: define({
    table: weightEntries,
    schema: weightRecord,
    toRow: (r) => ({ date: r.date, weightKg: r.weightKg, note: r.note || null }),
    toWire: (row: typeof weightEntries.$inferSelect) => ({ ...syncWire(row), date: row.date, weightKg: row.weightKg, note: row.note }),
  }),
  custom_exercises: define({
    table: customExercises,
    schema: customExerciseRecord,
    toRow: (r) => ({
      name: r.name,
      category: r.category,
      equipment: r.equipment,
      primaryMuscles: r.primaryMuscles,
      secondaryMuscles: r.secondaryMuscles,
      tracking: r.tracking,
      instructions: r.instructions || null,
      photoId: r.photoId,
    }),
    toWire: (row: typeof customExercises.$inferSelect) => ({
      ...syncWire(row),
      name: row.name,
      category: row.category as CustomExerciseRecord['category'],
      equipment: row.equipment as CustomExerciseRecord['equipment'],
      primaryMuscles: row.primaryMuscles as CustomExerciseRecord['primaryMuscles'],
      secondaryMuscles: row.secondaryMuscles as CustomExerciseRecord['secondaryMuscles'],
      tracking: row.tracking as CustomExerciseRecord['tracking'],
      instructions: row.instructions,
      photoId: row.photoId,
    }),
  }),
  exercise_favourites: define({
    table: exerciseFavourites,
    schema: favouriteRecord,
    toRow: (r) => ({ exerciseId: r.exerciseId }),
    toWire: (row: typeof exerciseFavourites.$inferSelect) => ({ ...syncWire(row), exerciseId: row.exerciseId }),
  }),
};

export type CollectionName = keyof typeof collections;
export const COLLECTION_NAMES = Object.keys(collections) as CollectionName[];
