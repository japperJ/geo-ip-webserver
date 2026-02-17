import { describe, expect, it } from 'vitest';
import { resolveTestDatabaseConfig } from './testDatabaseConfig.js';

describe('resolveTestDatabaseConfig', () => {
  it('uses defaults when no test database env vars are set', () => {
    const config = resolveTestDatabaseConfig({});

    expect(config).toEqual({
      host: 'localhost',
      port: 5434,
      database: 'geo_ip_webserver_test',
      user: 'dev_user',
      password: 'dev_password',
    });
  });

  it('uses TEST_DATABASE_* env vars when DATABASE_URL is absent', () => {
    const config = resolveTestDatabaseConfig({
      TEST_DATABASE_HOST: '127.0.0.1',
      TEST_DATABASE_PORT: '5432',
      TEST_DATABASE_NAME: 'custom_test_db',
      TEST_DATABASE_USER: 'test_user',
      TEST_DATABASE_PASSWORD: 'test_password',
    });

    expect(config).toEqual({
      host: '127.0.0.1',
      port: 5432,
      database: 'custom_test_db',
      user: 'test_user',
      password: 'test_password',
    });
  });

  it('prefers DATABASE_URL over TEST_DATABASE_* values', () => {
    const config = resolveTestDatabaseConfig({
      DATABASE_URL: 'postgresql://ci_user:ci_password@localhost:5432/geo_ip_webserver_test',
      TEST_DATABASE_HOST: '127.0.0.1',
      TEST_DATABASE_PORT: '5434',
      TEST_DATABASE_NAME: 'ignored_db',
      TEST_DATABASE_USER: 'ignored_user',
      TEST_DATABASE_PASSWORD: 'ignored_password',
    });

    expect(config).toEqual({
      host: 'localhost',
      port: 5432,
      database: 'geo_ip_webserver_test',
      user: 'ci_user',
      password: 'ci_password',
    });
  });

  it('falls back to TEST_DATABASE_* when DATABASE_URL is invalid', () => {
    const config = resolveTestDatabaseConfig({
      DATABASE_URL: 'not-a-valid-url',
      TEST_DATABASE_HOST: 'db-host',
      TEST_DATABASE_PORT: '5433',
      TEST_DATABASE_NAME: 'fallback_db',
      TEST_DATABASE_USER: 'fallback_user',
      TEST_DATABASE_PASSWORD: 'fallback_password',
    });

    expect(config).toEqual({
      host: 'db-host',
      port: 5433,
      database: 'fallback_db',
      user: 'fallback_user',
      password: 'fallback_password',
    });
  });
});
