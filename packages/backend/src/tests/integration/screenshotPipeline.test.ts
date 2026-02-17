import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Queue, Worker } from 'bullmq';
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { testPool } from '../setup.js';
import { authenticateJWT } from '../../middleware/authenticateJWT.js';
import { ipAccessControl, setIpAccessControlAccessLogService } from '../../middleware/ipAccessControl.js';
import { AccessLogService } from '../../services/AccessLogService.js';
import { ScreenshotService } from '../../services/ScreenshotService.js';
import { SiteService } from '../../services/SiteService.js';

const TEST_JWT_SECRET = 'test-jwt-secret-phase-d-gap-closure';
const BLOCKED_IP = '203.0.113.10';
const TEST_HOSTNAME = 'phase-d-gap.local';
const QUEUE_NAME = 'screenshots';

const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2lxkYAAAAASUVORK5CYII=';

type RedisConnection = {
  host: string;
  port: number;
  username?: string;
  password?: string;
};

function getRedisConnection(): RedisConnection {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
    };
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
  };
}

type S3Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
};

const REQUIRED_S3_ENV_VARS = [
  'AWS_S3_ENDPOINT',
  'AWS_S3_ACCESS_KEY_ID',
  'AWS_S3_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET',
] as const;

const missingS3EnvVars = REQUIRED_S3_ENV_VARS.filter((name) => {
  const value = process.env[name];
  return !value || value.trim() === '';
});

const enforceS3EnvContract = process.env.REQUIRE_SCREENSHOT_INTEGRATION_ENV === 'true';
const hasRequiredS3Config = missingS3EnvVars.length === 0;

if (!hasRequiredS3Config) {
  const message =
    `[screenshot pipeline integration] missing required S3 env (${missingS3EnvVars.join(', ')}). ` +
    'See packages/backend/TESTING.md for required variables and a local MinIO recipe.';

  if (enforceS3EnvContract) {
    throw new Error(
      `${message} REQUIRE_SCREENSHOT_INTEGRATION_ENV=true is set, so the integration gate must fail-fast.`
    );
  }

  console.warn(`[vitest] ${message} This suite will be skipped.`);
}

function getRequiredS3Config(): S3Config {
  const endpoint = process.env.AWS_S3_ENDPOINT;
  const accessKeyId = process.env.AWS_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_S3_SECRET_ACCESS_KEY;
  const bucket = process.env.AWS_S3_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'Missing required S3 test configuration. Set AWS_S3_ENDPOINT, AWS_S3_ACCESS_KEY_ID, AWS_S3_SECRET_ACCESS_KEY, and AWS_S3_BUCKET before running screenshotPipeline.test.ts'
    );
  }

  return {
    endpoint,
    region: process.env.AWS_S3_REGION || 'us-east-1',
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
  };
}

function extractKeyFromS3Url(s3Url: string): string {
  const match = s3Url.match(/^s3:\/\/[^/]+\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid s3 URL format: ${s3Url}`);
  }

  return match[1];
}

async function waitFor<T>(
  check: () => Promise<T | null>,
  timeoutMs: number,
  intervalMs: number,
  errorMessage: string
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await check();
    if (value !== null) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(errorMessage);
}

async function getRedisMaxmemoryPolicy(queue: Queue): Promise<string> {
  const redisClient = await queue.client;
  const configResult = await redisClient.config('GET', 'maxmemory-policy');

  if (Array.isArray(configResult)) {
    for (let i = 0; i < configResult.length - 1; i += 2) {
      if (configResult[i] === 'maxmemory-policy') {
        return configResult[i + 1] as string;
      }
    }
  }

  throw new Error(
    `Unable to determine Redis maxmemory-policy from CONFIG GET response: ${JSON.stringify(configResult)}`
  );
}

const describeScreenshotIntegration = hasRequiredS3Config ? describe : describe.skip;

describeScreenshotIntegration('screenshot pipeline integration', () => {
  const siteService = new SiteService(testPool);
  const accessLogService = new AccessLogService(testPool);
  const screenshotService = new ScreenshotService(getRedisConnection());
  const redisConnection = getRedisConnection();
  let s3Config!: S3Config;
  let s3Client!: S3Client;

  let app: Awaited<ReturnType<typeof buildTestServer>>;
  let queue: Queue;
  let testSiteId: string;
  let uploadedArtifactKey: string | null = null;

  async function buildTestServer(siteId: string) {
    const instance = Fastify({ logger: false, trustProxy: true });

    await instance.register(jwt, {
      secret: TEST_JWT_SECRET,
    });

    (instance as any).decorate('authenticate', authenticateJWT);
    (instance as any).decorate('pg', testPool);
    (instance as any).decorate('geoip', {
      lookup: () => null,
      isAnonymous: () => ({
        isVpn: false,
        isProxy: false,
        isHosting: false,
        isTor: false,
      }),
    });

    instance.addHook('onRequest', async (request) => {
      if (request.url.startsWith('/protected') || request.url.startsWith('/blocked-target')) {
        request.site = {
          id: siteId,
          slug: 'phase-d-gap-site',
          hostname: TEST_HOSTNAME,
          name: 'Phase D GAP Site',
          access_mode: 'ip_only',
          ip_allowlist: null,
          ip_denylist: [BLOCKED_IP],
          country_allowlist: null,
          country_denylist: null,
          block_vpn_proxy: false,
          geofence_type: null,
          geofence_polygon: null,
          geofence_center: null,
          geofence_radius_km: null,
          enabled: true,
          created_at: new Date(),
          updated_at: new Date(),
        } as any;
      }
    });

    instance.addHook('onRequest', ipAccessControl);

    instance.get('/blocked-target', async () => {
      return '<html><body>blocked page</body></html>';
    });

    instance.get('/protected', async () => {
      return { ok: true };
    });

    const { gdprRoutes } = await import('../../routes/gdpr.js');
    await instance.register(gdprRoutes);

    return instance;
  }

  beforeAll(async () => {
    s3Config = getRequiredS3Config();
    s3Client = new S3Client({
      endpoint: s3Config.endpoint,
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
      forcePathStyle: s3Config.forcePathStyle,
    });

    accessLogService.setSyncMode(true);
    accessLogService.setScreenshotService(screenshotService);
    setIpAccessControlAccessLogService(accessLogService);

    const createdSite = await siteService.create({
      slug: `phase-d-gap-${Date.now()}`,
      hostname: TEST_HOSTNAME,
      name: 'Phase D GAP Closure Site',
      access_mode: 'ip_only',
      ip_denylist: [BLOCKED_IP],
    });

    testSiteId = createdSite.id;
    app = await buildTestServer(testSiteId);
    queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  });

  beforeEach(async () => {
    uploadedArtifactKey = null;
    await testPool.query('DELETE FROM access_logs WHERE site_id = $1', [testSiteId]);
    await queue.drain(true);
  });

  afterAll(async () => {
    if (uploadedArtifactKey) {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: s3Config.bucket,
        Key: uploadedArtifactKey,
      }));
    }

    await queue.close();
    await screenshotService.close();
    await app.close();
    await testPool.query('DELETE FROM access_logs WHERE site_id = $1', [testSiteId]);
    await testPool.query('DELETE FROM sites WHERE id = $1', [testSiteId]);
  });

  it('proves blocked request -> enqueue -> worker upload/linkage -> artifacts fetch', async () => {
    const maxmemoryPolicy = await getRedisMaxmemoryPolicy(queue);
    expect(maxmemoryPolicy).toBe('noeviction');

    const blockedResponse = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        host: TEST_HOSTNAME,
        'x-forwarded-for': BLOCKED_IP,
      },
    });

    expect(blockedResponse.statusCode).toBe(403);
    expect(blockedResponse.json()).toMatchObject({ reason: 'ip_denylist' });

    const initialLogResult = await testPool.query(
      'SELECT id, timestamp, screenshot_url FROM access_logs WHERE site_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [testSiteId]
    );

    expect(initialLogResult.rows).toHaveLength(1);
    expect(initialLogResult.rows[0].screenshot_url).toBeNull();

    const waitingCount = await queue.getWaitingCount();
    expect(waitingCount).toBeGreaterThan(0);

    const pngBytes = Buffer.from(TEST_PNG_BASE64, 'base64');

    const worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        expect(job.name).toBe('capture');

        const key = `screenshots/blocked/${job.data.siteId}/${new Date(job.data.timestamp).toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.png`;
        const screenshotUrl = `s3://${s3Config.bucket}/${key}`;

        await s3Client.send(new PutObjectCommand({
          Bucket: s3Config.bucket,
          Key: key,
          Body: pngBytes,
          ContentType: 'image/png',
          Metadata: {
            logId: job.data.logId,
            siteId: job.data.siteId,
          },
        }));

        const updateResult = await testPool.query(
          `
            UPDATE access_logs
            SET screenshot_url = $3
            WHERE id = $1
              AND (
                timestamp = $2::timestamptz
                OR timestamp BETWEEN ($2::timestamptz - INTERVAL '1 second') AND ($2::timestamptz + INTERVAL '1 second')
              )
          `,
          [job.data.logId, job.data.timestamp, screenshotUrl]
        );

        if ((updateResult.rowCount || 0) === 0) {
          throw new Error(`No access_logs row matched id=${job.data.logId} timestamp=${job.data.timestamp}`);
        }

        uploadedArtifactKey = key;
        return { screenshotUrl, key };
      },
      {
        connection: redisConnection,
      }
    );

    try {
      const completedLog = await waitFor(
        async () => {
          const result = await testPool.query(
            'SELECT id, timestamp, screenshot_url FROM access_logs WHERE site_id = $1 ORDER BY timestamp DESC LIMIT 1',
            [testSiteId]
          );

          if (result.rows.length === 0 || !result.rows[0].screenshot_url) {
            return null;
          }

          return result.rows[0] as { id: string; timestamp: string; screenshot_url: string };
        },
        60000,
        500,
        'Timed out waiting for screenshot_url to be populated by worker'
      );

      const screenshotUrl = completedLog.screenshot_url;
      expect(screenshotUrl).toContain(`s3://${s3Config.bucket}/screenshots/blocked/${testSiteId}/`);

      const objectKey = extractKeyFromS3Url(screenshotUrl);
      uploadedArtifactKey = objectKey;

      const headResult = await s3Client.send(new HeadObjectCommand({
        Bucket: s3Config.bucket,
        Key: objectKey,
      }));

      expect(headResult.ContentType).toBe('image/png');

      const authToken = (app as any).jwt.sign({
        userId: randomUUID(),
        id: randomUUID(),
        email: 'phase-d-gap@example.com',
        role: 'super_admin',
        globalRole: 'super_admin',
      });

      const artifactRouteProbe = await app.inject({
        method: 'GET',
        url: '/api/artifacts/test',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(artifactRouteProbe.statusCode).not.toBe(404);

      const artifactResponse = await app.inject({
        method: 'GET',
        url: `/api/artifacts/${objectKey}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(artifactResponse.statusCode).toBe(200);
      const artifactBody = artifactResponse.json() as { url: string };
      expect(artifactBody.url).toContain('X-Amz-');

      const presignedFetch = await fetch(artifactBody.url);
      expect(presignedFetch.status).toBe(200);

      const fetchedBytes = new Uint8Array(await presignedFetch.arrayBuffer());
      expect(Array.from(fetchedBytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    } finally {
      await worker.close();
    }
  }, 70000);
});