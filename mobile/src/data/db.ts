import * as SQLite from 'expo-sqlite';
import { migrate } from './schema';
import { DbLike } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** The app's single database handle; migrated before first use. */
export function getDb(): Promise<DbLike> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('profit.db');
      await db.execAsync('PRAGMA journal_mode = WAL');
      await migrate(db as unknown as DbLike);
      return db;
    })();
  }
  return dbPromise as Promise<DbLike>;
}
