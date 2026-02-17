import { Pool } from 'pg';
import { beforeAll, afterAll } from 'vitest';
import { resolveTestDatabaseConfig } from './testDatabaseConfig.js';

export const testPool = new Pool(resolveTestDatabaseConfig());

// Clean up test database before all tests
// Note: Database bootstrap happens in globalSetup (see vitest.config.ts)
beforeAll(async () => {
  // Clean only access_logs, let test suites manage their sites
  await testPool.query('DELETE FROM access_logs');
});

// Close pool after all tests
afterAll(async () => {
  await testPool.end();
});
