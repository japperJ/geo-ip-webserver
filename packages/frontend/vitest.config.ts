import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      'playwright/**',
      'playwright-report/**',
      'test-results/**',
      'dist/**',
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
    teardownTimeout: 10000,
    watch: false,
    passWithNoTests: true,
  },
});
