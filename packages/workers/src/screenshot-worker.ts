import { Worker, Job } from 'bullmq';
import { chromium, Browser } from 'playwright';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pino from 'pino';
import { closeDbPool, updateAccessLogScreenshotUrl } from './db.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

interface ScreenshotJob {
  siteId: string;
  url: string;
  reason: string;
  logId: string;
  ipAddress: string;
  timestamp: string;
}

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

function getS3Endpoint(): string | undefined {
  const endpoint = process.env.AWS_S3_ENDPOINT || process.env.S3_ENDPOINT;
  if (!endpoint) {
    return undefined;
  }

  return endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : `http://${endpoint}`;
}

const s3Endpoint = getS3Endpoint();
const s3Region = process.env.AWS_S3_REGION || process.env.S3_REGION || 'us-east-1';
const s3AccessKeyId = process.env.AWS_S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || '';
const s3SecretAccessKey = process.env.AWS_S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY || '';
const s3ForcePathStyleRaw = process.env.AWS_S3_FORCE_PATH_STYLE || process.env.S3_FORCE_PATH_STYLE || 'true';
const s3ForcePathStyle = s3ForcePathStyleRaw === 'true';

// S3 Client
const s3Client = new S3Client({
  endpoint: s3Endpoint,
  region: s3Region,
  credentials: {
    accessKeyId: s3AccessKeyId,
    secretAccessKey: s3SecretAccessKey
  },
  forcePathStyle: s3ForcePathStyle
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || 'screenshots';
const redisConnection = getRedisConnection();

// Browser instance (reused across jobs)
let browser: Browser | null = null;

async function initBrowser() {
  if (!browser) {
    logger.info('Launching Chromium browser...');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    logger.info('Browser launched successfully');
  }
  return browser;
}

async function captureScreenshot(job: Job<ScreenshotJob>) {
  const { siteId, url, reason, logId, timestamp } = job.data;
  
  logger.info({ jobId: job.id, url, reason }, 'Processing screenshot job');

  try {
    const browser = await initBrowser();
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 10000
    });

    // Capture screenshot
    const screenshot = await page.screenshot({
      fullPage: true,
      type: 'png'
    });

    await context.close();

    // Upload to S3
    const safeTimestamp = timestamp.replace(/[:.]/g, '-');
    const safeReason = reason.replace(/[^a-zA-Z0-9-_]/g, '_');
    const key = `screenshots/blocked/${siteId}/${safeTimestamp}-${safeReason}.png`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: screenshot,
      ContentType: 'image/png',
      Metadata: {
        siteId,
        reason,
        logId,
        capturedAt: new Date().toISOString()
      }
    }));

    const screenshotUrl = `s3://${BUCKET_NAME}/${key}`;

    await updateAccessLogScreenshotUrl({
      id: logId,
      timestamp,
      screenshotUrl,
    });
    
    logger.info({ jobId: job.id, screenshotUrl }, 'Screenshot captured and uploaded');

    return { screenshotUrl, key };

  } catch (error) {
    logger.error({ jobId: job.id, error }, 'Failed to capture screenshot');
    throw error;
  }
}

// Worker
const worker = new Worker<ScreenshotJob>(
  'screenshots',
  async (job: Job<ScreenshotJob>) => {
    return await captureScreenshot(job);
  },
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000
    }
  }
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err }, 'Job failed');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker...');
  await worker.close();
  await closeDbPool();
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing worker...');
  await worker.close();
  await closeDbPool();
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

logger.info('Screenshot worker started');
