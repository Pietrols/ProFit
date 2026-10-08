import { DatabaseSync } from 'node:sqlite';
import { createDatabase, migrate, type Database, type Driver } from '../database';
import { migrations } from '../migrations';

// A Driver over Node's built-in SQLite, so tests run the app's real SQL. Each call opens a fresh
// in-memory database, which stands for one phone.
export function nodeDriver(): Driver & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    async exec(sql) {
      raw.exec(sql);
    },
    async run(sql, params) {
      const result = raw.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    async all<T>(sql: string, params: (string | number | null)[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
  };
}

export async function testDatabase(): Promise<Database> {
  const db = createDatabase(nodeDriver());
  await migrate(db, migrations);
  return db;
}
