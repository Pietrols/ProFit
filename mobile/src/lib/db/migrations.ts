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
];
