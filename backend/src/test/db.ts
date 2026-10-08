import { sql } from 'drizzle-orm';
import { createDatabase, type Database } from '../db/client.js';
import { TEST_DATABASE_URL } from './database-url.js';

export function openTestDatabase(): Database {
  return createDatabase(TEST_DATABASE_URL);
}

// Empties every table between tests. Every table belongs to a user, so the cascade from users covers
// them all.
export async function resetTables(database: Database): Promise<void> {
  await database.db.execute(sql`TRUNCATE users CASCADE`);
}
