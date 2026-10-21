import { z } from 'zod';

export const isoTime = z.iso.datetime({ offset: true });

// A calendar date as the phone saw it (YYYY-MM-DD), checked to be a real day.
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-07')
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
  }, 'is not a real date');

export const syncFields = {
  id: z.uuid(),
  updatedAt: isoTime,
  deletedAt: isoTime.nullable(),
};

export const LOG_FIELDS = [
  'reps',
  'weight',
  'time',
  'distance',
  'rest',
  'RPE',
  'notes',
  'done',
] as const;
export const exerciseId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'must be an exercise id');
export const name = z.string().trim().min(1).max(80);
export const exerciseTargetFields = {
  sets: z.number().int().min(1).max(100),
  targetReps: z.number().int().min(1).max(1000).nullable(),
  targetTimeSeconds: z.number().int().min(1).max(86400).nullable(),
  targetDistanceMetres: z.number().min(1).max(1000000).nullable(),
  restSeconds: z.number().int().min(0).max(3600),
  logFields: z
    .array(z.enum(LOG_FIELDS))
    .min(1)
    .max(8)
    .refine((v) => new Set(v).size === v.length, 'log fields must be unique'),
};
