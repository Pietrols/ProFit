import { z } from 'zod';
import { weightEntries } from '../db/schema.js';

// The tables phones sync, and how each record looks on the wire. Adding a synced feature later means
// adding one entry here: a table with the sync columns, a Zod schema, and the two mappings.

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

export const weightRecord = z.strictObject({
  ...syncFields,
  date: calendarDate,
  weightKg: z.number().min(20).max(400),
  note: z.string().trim().max(200).nullable(),
});

export type WeightRecord = z.infer<typeof weightRecord>;

export const collections = {
  weight_entries: {
    table: weightEntries,
    schema: weightRecord,
    // Wire record -> table columns (without the sync columns, which the service fills in).
    toRow: (r: WeightRecord) => ({ date: r.date, weightKg: r.weightKg, note: r.note || null }),
    // Table row -> wire record.
    toWire: (row: typeof weightEntries.$inferSelect): WeightRecord => ({
      id: row.id,
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      date: row.date,
      weightKg: row.weightKg,
      note: row.note,
    }),
  },
} as const;

export type CollectionName = keyof typeof collections;
export const COLLECTION_NAMES = Object.keys(collections) as CollectionName[];
