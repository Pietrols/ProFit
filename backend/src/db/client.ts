import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;
export type Database = { db: Db; pool: pg.Pool; close: () => Promise<void> };

// One connection pool per process. Tests create their own against the test database.
export function createDatabase(url: string): Database {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
