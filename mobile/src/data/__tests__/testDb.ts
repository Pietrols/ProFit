// node:sqlite adapter satisfying DbLike, so data-layer logic runs in tests
// against real SQLite semantics without any native Expo module.
import { DatabaseSync } from 'node:sqlite';
import { DbLike, SqlParam } from '../types';

export function createTestDb(): DbLike {
  const db = new DatabaseSync(':memory:');
  return {
    async runAsync(sql: string, params: SqlParam[] = []) {
      return db.prepare(sql).run(...params);
    },
    async getAllAsync<T>(sql: string, params: SqlParam[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlParam[] = []) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async execAsync(sql: string) {
      db.exec(sql);
    },
  };
}
