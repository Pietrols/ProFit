// The tables this phone syncs and how a row maps to the API's wire record. Mirrors
// backend/src/sync/collections.ts; adding a synced feature means one entry here and one there.

export type WireRecord = { id: string; updatedAt: string; deletedAt: string | null } & Record<string, unknown>;

export type Collection = {
  name: string; // the API's collection name, also the SQLite table name
  // Data columns besides the sync columns: SQLite column name and wire field name. json marks lists,
  // which SQLite keeps as JSON text and the API sends as arrays.
  fields: { column: string; wire: string; json?: boolean }[];
};

export const weightEntriesCollection: Collection = {
  name: 'weight_entries',
  fields: [
    { column: 'date', wire: 'date' },
    { column: 'weight_kg', wire: 'weightKg' },
    { column: 'note', wire: 'note' },
  ],
};

export const customExercisesCollection: Collection = {
  name: 'custom_exercises',
  fields: [
    { column: 'name', wire: 'name' },
    { column: 'category', wire: 'category' },
    { column: 'equipment', wire: 'equipment' },
    { column: 'primary_muscles', wire: 'primaryMuscles', json: true },
    { column: 'secondary_muscles', wire: 'secondaryMuscles', json: true },
    { column: 'tracking', wire: 'tracking' },
    { column: 'instructions', wire: 'instructions' },
    { column: 'photo_id', wire: 'photoId' },
  ],
};

export const exerciseFavouritesCollection: Collection = {
  name: 'exercise_favourites',
  fields: [{ column: 'exercise_id', wire: 'exerciseId' }],
};

export const syncedCollections: Collection[] = [weightEntriesCollection, customExercisesCollection, exerciseFavouritesCollection];

type Row = Record<string, unknown>;

export function toWire(collection: Collection, row: Row): WireRecord {
  const record: WireRecord = { id: String(row.id), updatedAt: String(row.updated_at), deletedAt: (row.deleted_at as string | null) ?? null };
  for (const { column, wire, json } of collection.fields) {
    const value = row[column] ?? null;
    record[wire] = json && typeof value === 'string' ? JSON.parse(value) : value;
  }
  return record;
}

// Column names and values for writing a wire record into SQLite.
export function fromWire(collection: Collection, record: WireRecord): { columns: string[]; values: (string | number | null)[] } {
  const columns = ['id', 'updated_at', 'deleted_at', ...collection.fields.map((f) => f.column)];
  const values = [
    record.id,
    record.updatedAt,
    record.deletedAt,
    ...collection.fields.map((f) => {
      const value = record[f.wire] ?? null;
      return (f.json ? JSON.stringify(value ?? []) : value) as string | number | null;
    }),
  ];
  return { columns, values };
}
