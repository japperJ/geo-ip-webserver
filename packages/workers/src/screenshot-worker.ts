import { Worker, Job } from 'bullmq';
import { chromium, Browser } from 'playwright';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pino from 'pino';

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

// S3 Client
const s3Client = new S3Client({
  endpoint: process.env.AWS_S3_ENDPOINT,
  region: process.env.AWS_S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY || ''
  },
  forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true'
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'screenshots';

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
    const key = `screenshots/blocked/${siteId}/${timestamp}-${reason}.png`;
    
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
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6380')
    },
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
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

logger.info('Screenshot worker started');
