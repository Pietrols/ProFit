import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` compares src/db/schema.ts with the last migration and writes a new SQL file.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://profit:profit@localhost:5432/profit' },
});
