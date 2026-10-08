import type { Migration } from './database';

// The phone's schema, one step per version. Never edit a step that has shipped; add a new one.
//
// Every synced table has the same sync columns (see docs/phases/PHASE_2.md):
//   id          uuid made on the phone
//   user_id     whose record it is (several people can sign in on one phone)
//   updated_at  ISO time of the last edit on any phone; the later edit wins a merge
//   deleted_at  set instead of deleting, so the delete syncs too
//   dirty       1 while the latest edit has not reached the server

export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE weight_entries (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        weight_kg REAL NOT NULL,
        note TEXT,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX weight_entries_user_date ON weight_entries (user_id, date);
      CREATE INDEX weight_entries_user_dirty ON weight_entries (user_id, dirty);

      -- How far each signed-in user on this phone has pulled from the server.
      CREATE TABLE sync_state (
        user_id TEXT PRIMARY KEY NOT NULL,
        cursor INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT
      );
    `,
  },
  {
    version: 2,
    sql: `
      -- The user's own exercises. Muscle lists are JSON arrays.
      CREATE TABLE custom_exercises (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        equipment TEXT,
        primary_muscles TEXT NOT NULL,
        secondary_muscles TEXT NOT NULL,
        tracking TEXT NOT NULL,
        instructions TEXT,
        photo_id TEXT,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX custom_exercises_user_dirty ON custom_exercises (user_id, dirty);

      -- Starred exercises. The id is derived from user and exercise, so each pair has one row.
      CREATE TABLE exercise_favourites (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX exercise_favourites_user_dirty ON exercise_favourites (user_id, dirty);

      -- Photos: where the file is on this phone, and whether the server has it yet.
      CREATE TABLE media (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        local_path TEXT,
        content_type TEXT NOT NULL,
        uploaded INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX media_user_uploaded ON media (user_id, uploaded);
    `,
  },
];
