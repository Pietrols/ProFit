import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { customExercises, dailyHabit, exerciseFavourites, planDays, planExercises, plans, weightEntries } from '../db/schema.js';

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

export const LOG_FIELDS = ['reps', 'weight', 'time', 'distance', 'rest', 'RPE', 'notes', 'done'] as const;
const exerciseId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'must be an exercise id');
const position = z.number().int().min(0).max(10000);
const name = z.string().trim().min(1).max(80);
export const planRecord = z.strictObject({
  ...syncFields, name, shape: z.enum(['cycle', 'weekly']), difficulty: z.enum(['gentle', 'standard', 'hard']), active: z.boolean(),
});
export const planDayRecord = z.strictObject({
  ...syncFields, planId: z.uuid(), position, weekday: z.number().int().min(1).max(7).nullable(), name, restDay: z.boolean(),
});
export const planExerciseRecord = z.strictObject({
  ...syncFields, dayId: z.uuid(), exerciseId, position, sets: z.number().int().min(1).max(100),
  targetReps: z.number().int().min(1).max(1000).nullable(),
  targetTimeSeconds: z.number().int().min(1).max(86400).nullable(),
  targetDistanceMetres: z.number().min(1).max(1000000).nullable(),
  restSeconds: z.number().int().min(0).max(3600),
  logFields: z.array(z.enum(LOG_FIELDS)).min(1).max(8).refine((v) => new Set(v).size === v.length, 'log fields must be unique'),
});
export const habitRecord = z.strictObject({ ...syncFields, exerciseIds: z.array(exerciseId).max(100) });

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
  plans: define({
    table: plans, schema: planRecord,
    toRow: (r) => ({ name: r.name, shape: r.shape, difficulty: r.difficulty, active: r.active }),
    toWire: (row: typeof plans.$inferSelect) => ({ ...syncWire(row), name: row.name as z.infer<typeof planRecord>['name'], shape: row.shape as z.infer<typeof planRecord>['shape'], difficulty: row.difficulty as z.infer<typeof planRecord>['difficulty'], active: row.active as z.infer<typeof planRecord>['active'] }),
  }),
  plan_days: define({
    table: planDays, schema: planDayRecord,
    toRow: (r) => ({ planId: r.planId, position: r.position, weekday: r.weekday, name: r.name, restDay: r.restDay }),
    toWire: (row: typeof planDays.$inferSelect) => ({ ...syncWire(row), planId: row.planId as z.infer<typeof planDayRecord>['planId'], position: row.position as z.infer<typeof planDayRecord>['position'], weekday: row.weekday as z.infer<typeof planDayRecord>['weekday'], name: row.name as z.infer<typeof planDayRecord>['name'], restDay: row.restDay as z.infer<typeof planDayRecord>['restDay'] }),
  }),
  plan_exercises: define({
    table: planExercises, schema: planExerciseRecord,
    toRow: (r) => ({ dayId: r.dayId, exerciseId: r.exerciseId, position: r.position, sets: r.sets, targetReps: r.targetReps, targetTimeSeconds: r.targetTimeSeconds, targetDistanceMetres: r.targetDistanceMetres, restSeconds: r.restSeconds, logFields: r.logFields }),
    toWire: (row: typeof planExercises.$inferSelect) => ({ ...syncWire(row), dayId: row.dayId as z.infer<typeof planExerciseRecord>['dayId'], exerciseId: row.exerciseId as z.infer<typeof planExerciseRecord>['exerciseId'], position: row.position as z.infer<typeof planExerciseRecord>['position'], sets: row.sets as z.infer<typeof planExerciseRecord>['sets'], targetReps: row.targetReps as z.infer<typeof planExerciseRecord>['targetReps'], targetTimeSeconds: row.targetTimeSeconds as z.infer<typeof planExerciseRecord>['targetTimeSeconds'], targetDistanceMetres: row.targetDistanceMetres as z.infer<typeof planExerciseRecord>['targetDistanceMetres'], restSeconds: row.restSeconds as z.infer<typeof planExerciseRecord>['restSeconds'], logFields: row.logFields as z.infer<typeof planExerciseRecord>['logFields'] }),
  }),
  daily_habit: define({
    table: dailyHabit, schema: habitRecord,
    toRow: (r) => ({ exerciseIds: r.exerciseIds }),
    toWire: (row: typeof dailyHabit.$inferSelect) => ({ ...syncWire(row), exerciseIds: row.exerciseIds as z.infer<typeof habitRecord>['exerciseIds'] }),
  }),
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
