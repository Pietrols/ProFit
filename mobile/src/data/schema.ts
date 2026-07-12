import { DbLike } from './types';

// Versioned migrations via PRAGMA user_version. Append, never edit.
const MIGRATIONS: string[] = [
  // v1 — exercises + sync metadata
  `
  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    primary_muscles TEXT NOT NULL,   -- JSON array
    secondary_muscles TEXT NOT NULL, -- JSON array
    equipment TEXT NOT NULL,         -- JSON array
    demo_url TEXT NOT NULL,
    instructions TEXT NOT NULL,      -- JSON array
    home_alternative_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
  CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  // v2 — offline-first workout sessions (device is source of truth until synced)
  `
  CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,      -- WorkoutSessionPayload JSON
    finished_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_unsynced ON workout_sessions(synced);
  `,
  // v3 — offline-first bodyweight log
  `
  CREATE TABLE IF NOT EXISTS bodyweight_entries (
    id TEXT PRIMARY KEY NOT NULL,
    weight_kg REAL NOT NULL,
    logged_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_bodyweight_unsynced ON bodyweight_entries(synced);
  `,
];

export async function migrate(db: DbLike): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.execAsync(MIGRATIONS[v]);
    await db.execAsync(`PRAGMA user_version = ${v + 1}`);
  }
}
