// The phone's database layer. Every query goes through one queue: expo-sqlite's transactions are not
// exclusive, so without the queue an unrelated query could land in the middle of a transaction.
// The driver is passed in, so tests run the same SQL on Node's built-in SQLite.

export type SqlValue = string | number | null;

// What a SQLite connection must offer. expo-sqlite in the app, node:sqlite in tests.
export type Driver = {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params: SqlValue[]): Promise<T[]>;
};

export type Sql = {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
};

export type Database = Sql & {
  // Runs fn inside BEGIN/COMMIT, rolling back if it throws. Use only the tx handed to fn inside it:
  // calling the database itself from inside would wait behind the transaction forever.
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
};

export type Migration = { version: number; sql: string };

export function createDatabase(driver: Driver): Database {
  let tail: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  }

  // Direct access, for use while the queue is already held.
  const direct: Sql = {
    exec: (sql) => driver.exec(sql),
    run: (sql, params = []) => driver.run(sql, params),
    all: (sql, params = []) => driver.all(sql, params),
    first: async (sql, params = []) => (await driver.all<never>(sql, params))[0] ?? null,
  };

  return {
    exec: (sql) => enqueue(() => direct.exec(sql)),
    run: (sql, params) => enqueue(() => direct.run(sql, params)),
    all: (sql, params) => enqueue(() => direct.all(sql, params)),
    first: (sql, params) => enqueue(() => direct.first(sql, params)),
    transaction: (fn) =>
      enqueue(async () => {
        await driver.exec('BEGIN');
        try {
          const result = await fn(direct);
          await driver.exec('COMMIT');
          return result;
        } catch (error) {
          await driver.exec('ROLLBACK');
          throw error;
        }
      }),
  };
}

// Brings the database up to the latest schema. Each migration runs once, in order, in its own
// transaction; SQLite's user_version records how far the file has got.
export async function migrate(db: Database, migrations: Migration[]): Promise<number> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.exec(`PRAGMA user_version = ${Number(migration.version)}`);
    });
    current = migration.version;
  }
  return current;
}
