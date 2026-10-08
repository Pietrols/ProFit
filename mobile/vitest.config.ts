import { defineConfig } from 'vitest/config';

// Unit tests cover pure logic only (no React Native rendering), so they run in plain Node.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
