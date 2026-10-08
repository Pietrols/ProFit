import { loadConfig } from '../config.js';
import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';

// `npm run db:migrate`: applies any migrations the database has not seen yet.
const config = loadConfig();
const database = createDatabase(config.DATABASE_URL);
try {
  await runMigrations(database.db);
  console.log('Migrations applied.');
} finally {
  await database.close();
}
