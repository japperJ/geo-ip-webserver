import { Pool } from 'pg';

interface UpdateAccessLogScreenshotUrlParams {
  id: string;
  timestamp: string;
  screenshotUrl: string;
}

function createDbPool(): Pool {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  return new Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5434', 10),
    database: process.env.DATABASE_NAME || 'geo_ip_webserver',
    user: process.env.DATABASE_USER || 'dev_user',
    password: process.env.DATABASE_PASSWORD || 'dev_password',
  });
}

const dbPool = createDbPool();

export async function updateAccessLogScreenshotUrl(params: UpdateAccessLogScreenshotUrlParams): Promise<void> {
  await dbPool.query(
    `
      UPDATE access_logs
      SET screenshot_url = $3
      WHERE id = $1 AND timestamp = $2::timestamptz
    `,
    [params.id, params.timestamp, params.screenshotUrl]
  );
}

export async function closeDbPool(): Promise<void> {
  await dbPool.end();
}
