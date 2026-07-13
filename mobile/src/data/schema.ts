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
  // v4 — offline-first nutrition (meal profile + daily logs)
  `
  CREATE TABLE IF NOT EXISTS meal_profile_items (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    typical_portion TEXT NOT NULL,
    deleted_at TEXT,
    synced INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS meal_logs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    portion TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    logged_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_meal_logs_unsynced ON meal_logs(synced);
  `,
  // v5 — chat history cache (server-owned; readable offline)
  `
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  // v6 — recovery check-ins (soreness/sleep → deload logic)
  `
  CREATE TABLE IF NOT EXISTS recovery_checkins (
    id TEXT PRIMARY KEY NOT NULL,
    soreness INTEGER NOT NULL,
    sleep_quality INTEGER NOT NULL,
    logged_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );
  `,
  // v7 — meal macros (Group B): nullable numbers + estimated-field flags
  `
  ALTER TABLE meal_logs ADD COLUMN protein REAL;
  ALTER TABLE meal_logs ADD COLUMN carbs REAL;
  ALTER TABLE meal_logs ADD COLUMN fat REAL;
  ALTER TABLE meal_logs ADD COLUMN calories REAL;
  ALTER TABLE meal_logs ADD COLUMN estimated_fields TEXT NOT NULL DEFAULT '[]';
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
