import { describe, expect, it } from 'vitest';
import { createDatabase, migrate } from '../database';
import { migrations } from '../migrations';
import { nodeDriver } from './nodeDriver';

describe('migrate', () => {
  it('creates the schema once and records the version', async () => {
    const db = createDatabase(nodeDriver());
    const latest = Math.max(...migrations.map((m) => m.version));
    expect(await migrate(db, migrations)).toBe(latest);
    expect(await migrate(db, migrations)).toBe(latest);
    const tables = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    expect(tables.map((t) => t.name)).toEqual(['custom_exercises', 'daily_habit', 'exercise_favourites', 'media', 'plan_days', 'plan_exercises', 'plans', 'sync_state', 'weight_entries']);
  });

  it('applies only the steps a database has not had yet', async () => {
    const db = createDatabase(nodeDriver());
    await migrate(db, [{ version: 1, sql: 'CREATE TABLE a (x INTEGER)' }]);
    const version = await migrate(db, [
      { version: 1, sql: 'CREATE TABLE a (x INTEGER)' },
      { version: 2, sql: 'CREATE TABLE b (y INTEGER)' },
    ]);
    expect(version).toBe(2);
  });

  it('leaves the database unchanged when a step fails', async () => {
    const db = createDatabase(nodeDriver());
    await expect(migrate(db, [{ version: 1, sql: 'CREATE TABLE ok (x INTEGER); NOT VALID SQL' }])).rejects.toThrow();
    expect(await db.first<{ user_version: number }>('PRAGMA user_version')).toEqual({ user_version: 0 });
    expect(await db.all("SELECT name FROM sqlite_master WHERE name = 'ok'")).toEqual([]);
  });
});

describe('transactions', () => {
  it('commits together or not at all', async () => {
    const db = createDatabase(nodeDriver());
    await db.exec('CREATE TABLE t (x INTEGER)');
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t VALUES (?)', [1]);
      await tx.run('INSERT INTO t VALUES (?)', [2]);
    });
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO t VALUES (?)', [3]);
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect(await db.all('SELECT x FROM t ORDER BY x')).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('keeps other queries out of a running transaction', async () => {
    const db = createDatabase(nodeDriver());
    await db.exec('CREATE TABLE t (x INTEGER)');
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tx = db.transaction(async (t) => {
      await t.run('INSERT INTO t VALUES (?)', [1]);
      await gate;
      throw new Error('roll back');
    });
    // Queued behind the transaction, so it must not see (or be rolled back with) its insert.
    const outside = db.run('INSERT INTO t VALUES (?)', [2]);
    release();
    await expect(tx).rejects.toThrow('roll back');
    await outside;
    expect(await db.all('SELECT x FROM t')).toEqual([{ x: 2 }]);
  });
});
