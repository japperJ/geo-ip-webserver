export interface TestDatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

const DEFAULT_TEST_DB_CONFIG: TestDatabaseConfig = {
  host: 'localhost',
  port: 5434,
  database: 'geo_ip_webserver_test',
  user: 'dev_user',
  password: 'dev_password',
};

function parsePort(port?: string): number | undefined {
  if (!port) {
    return undefined;
  }

  const parsed = Number.parseInt(port, 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}

function parseDatabaseUrl(databaseUrl: string): Partial<TestDatabaseConfig> | null {
  try {
    const parsed = new URL(databaseUrl);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
      return null;
    }

    const pathname = parsed.pathname?.replace(/^\//, '').trim();
    const database = pathname ? decodeURIComponent(pathname) : undefined;

    return {
      host: parsed.hostname || undefined,
      port: parsePort(parsed.port),
      database,
      user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve test DB config with precedence:
 * 1) DATABASE_URL
 * 2) TEST_DATABASE_* env vars
 * 3) local defaults
 */
export function resolveTestDatabaseConfig(env: NodeJS.ProcessEnv = process.env): TestDatabaseConfig {
  const fromUrl = env.DATABASE_URL ? parseDatabaseUrl(env.DATABASE_URL) : null;

  return {
    host: fromUrl?.host || env.TEST_DATABASE_HOST || DEFAULT_TEST_DB_CONFIG.host,
    port: fromUrl?.port || parsePort(env.TEST_DATABASE_PORT) || DEFAULT_TEST_DB_CONFIG.port,
    database: fromUrl?.database || env.TEST_DATABASE_NAME || DEFAULT_TEST_DB_CONFIG.database,
    user: fromUrl?.user || env.TEST_DATABASE_USER || DEFAULT_TEST_DB_CONFIG.user,
    password: fromUrl?.password || env.TEST_DATABASE_PASSWORD || DEFAULT_TEST_DB_CONFIG.password,
  };
}
