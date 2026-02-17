import { Pool } from 'pg';
import { beforeAll, afterAll } from 'vitest';

export const testPool = new Pool({
  host: process.env.TEST_DATABASE_HOST || 'localhost',
  port: parseInt(process.env.TEST_DATABASE_PORT || '5434'),
  database: process.env.TEST_DATABASE_NAME || 'geo_ip_webserver_test',
  user: process.env.TEST_DATABASE_USER || 'dev_user',
  password: process.env.TEST_DATABASE_PASSWORD || 'dev_password',
});

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
