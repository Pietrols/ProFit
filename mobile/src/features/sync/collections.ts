// The tables this phone syncs and how a row maps to the API's wire record. Mirrors
// backend/src/sync/collections.ts; adding a synced feature means one entry here and one there.

export type WireRecord = { id: string; updatedAt: string; deletedAt: string | null } & Record<string, unknown>;

export type Collection = {
  name: string; // the API's collection name, also the SQLite table name
  // Data columns besides the sync columns: SQLite column name and wire field name. json marks lists,
  // which SQLite keeps as JSON text and the API sends as arrays.
  fields: { column: string; wire: string; json?: boolean; boolean?: boolean }[];
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

export const plansCollection: Collection = { name: 'plans', fields: [
  { column: 'name', wire: 'name' },
  { column: 'shape', wire: 'shape' },
  { column: 'difficulty', wire: 'difficulty' },
  { column: 'active', wire: 'active', boolean: true },
] };
export const planDaysCollection: Collection = { name: 'plan_days', fields: [
  { column: 'plan_id', wire: 'planId' },
  { column: 'position', wire: 'position' },
  { column: 'weekday', wire: 'weekday' },
  { column: 'name', wire: 'name' },
  { column: 'rest_day', wire: 'restDay', boolean: true },
] };
export const planExercisesCollection: Collection = { name: 'plan_exercises', fields: [
  { column: 'day_id', wire: 'dayId' },
  { column: 'exercise_id', wire: 'exerciseId' },
  { column: 'position', wire: 'position' },
  { column: 'sets', wire: 'sets' },
  { column: 'target_reps', wire: 'targetReps' },
  { column: 'target_time_seconds', wire: 'targetTimeSeconds' },
  { column: 'target_distance_metres', wire: 'targetDistanceMetres' },
  { column: 'rest_seconds', wire: 'restSeconds' },
  { column: 'log_fields', wire: 'logFields', json: true },
] };
export const dailyHabitCollection: Collection = { name: 'daily_habit', fields: [
  { column: 'exercise_ids', wire: 'exerciseIds', json: true },
] };
export const workoutSessionsCollection: Collection = { name: 'workout_sessions', fields: [
  { column: 'plan_id', wire: 'planId' }, { column: 'day_id', wire: 'dayId' },
  { column: 'local_date', wire: 'localDate' }, { column: 'started_at', wire: 'startedAt' },
  { column: 'ended_at', wire: 'endedAt' }, { column: 'status', wire: 'status' },
  { column: 'notes', wire: 'notes' }, { column: 'easier_today', wire: 'easierToday', boolean: true },
  { column: 'snapshot', wire: 'snapshot', json: true },
] };
export const setLogsCollection: Collection = { name: 'set_logs', fields: [
  { column: 'session_id', wire: 'sessionId' }, { column: 'exercise_position', wire: 'exercisePosition' },
  { column: 'set_index', wire: 'setIndex' }, { column: 'logged_at', wire: 'loggedAt' },
  { column: 'log_fields', wire: 'logFields', json: true }, { column: 'values_json', wire: 'values', json: true },
] };
export const syncedCollections: Collection[] = [weightEntriesCollection, customExercisesCollection, exerciseFavouritesCollection, plansCollection, planDaysCollection, planExercisesCollection, dailyHabitCollection, workoutSessionsCollection, setLogsCollection];

type Row = Record<string, unknown>;

export function toWire(collection: Collection, row: Row): WireRecord {
  const record: WireRecord = { id: String(row.id), updatedAt: String(row.updated_at), deletedAt: (row.deleted_at as string | null) ?? null };
  for (const { column, wire, json, boolean } of collection.fields) {
    const value = row[column] ?? null;
    record[wire] = boolean ? !!value : json && typeof value === 'string' ? JSON.parse(value) : value;
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
      return (f.boolean ? (value ? 1 : 0) : f.json ? JSON.stringify(value ?? []) : value) as string | number | null;
    }),
  ];
  return { columns, values };
}
