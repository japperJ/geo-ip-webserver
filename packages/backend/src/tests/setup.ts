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
beforeAll(async () => {
  await testPool.query('DELETE FROM sites');
});

// Close pool after all tests
afterAll(async () => {
  await testPool.end();
});
