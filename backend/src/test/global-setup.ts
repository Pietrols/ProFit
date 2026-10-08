import pg from 'pg';
import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { TEST_DATABASE_URL, adminUrlFor } from './database-url.js';

// Runs once before all test files: drops and recreates the test database, then migrates it.
export default async function setup(): Promise<void> {
  const { adminUrl, dbName } = adminUrlFor(TEST_DATABASE_URL);
  if (!/^[a-z0-9_]+$/.test(dbName) || !dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${dbName}": the test database name must end in _test.`);
  }
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await admin.end();
  }
  const database = createDatabase(TEST_DATABASE_URL);
  try {
    await runMigrations(database.db);
  } finally {
    await database.close();
  }
}
