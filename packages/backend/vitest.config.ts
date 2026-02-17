import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 15000,
    exclude: [
      ...configDefaults.exclude,
      'dist/**',
      'coverage/**',
    ],
    pool: 'forks',
    poolMatchGlobs: [['**/*.test.ts', 'forks']],
    // Run tests serially to avoid parallel DB access issues
    fileParallelism: false,
    // Global setup runs once before all tests
    globalSetup: ['./src/tests/globalSetup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
  },
});
