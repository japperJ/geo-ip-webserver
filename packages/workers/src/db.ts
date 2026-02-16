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
  const result = await dbPool.query(
    `
      UPDATE access_logs
      SET screenshot_url = $3
      WHERE id = $1
        AND (
          timestamp = $2::timestamptz
          OR timestamp BETWEEN ($2::timestamptz - INTERVAL '1 second') AND ($2::timestamptz + INTERVAL '1 second')
        )
    `,
    [params.id, params.timestamp, params.screenshotUrl]
  );

  if ((result.rowCount || 0) === 0) {
    throw new Error(`Failed to link screenshot to access log id=${params.id} timestamp=${params.timestamp}`);
  }
}

export async function closeDbPool(): Promise<void> {
  await dbPool.end();
}
