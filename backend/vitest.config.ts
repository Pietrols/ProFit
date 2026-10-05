import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Creates a fresh profit_test database and applies the migrations once per run.
    globalSetup: ['./src/test/global-setup.ts'],
    // Test files share one database, so they run one after another.
    fileParallelism: false,
  },
});
