import * as SQLite from 'expo-sqlite';
import { createDatabase, migrate, type Database } from './database';
import { migrations } from './migrations';

// The app's one database file, opened and migrated on first use.
let opening: Promise<Database> | null = null;

export function getAppDatabase(): Promise<Database> {
  opening ??= open().catch((error: unknown) => {
    opening = null; // let a later call try again
    throw error;
  });
  return opening;
}

async function open(): Promise<Database> {
  const connection = await SQLite.openDatabaseAsync('profit.db');
  const db = createDatabase({
    exec: (sql) => connection.execAsync(sql),
    run: async (sql, params) => ({ changes: (await connection.runAsync(sql, params)).changes }),
    all: (sql, params) => connection.getAllAsync(sql, params),
  });
  await migrate(db, migrations);
  return db;
}
