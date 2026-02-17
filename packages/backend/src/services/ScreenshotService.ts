import { Queue } from 'bullmq';
import type { FastifyInstance } from 'fastify';

export interface ScreenshotJobData {
  siteId: string;
  url: string;
  reason: string;
  logId: string;
  ipAddress: string;
  timestamp: string;
}

export class ScreenshotService {
  private queue: Queue<ScreenshotJobData>;

  constructor(redisConnection: { host: string; port: number }) {
    this.queue = new Queue<ScreenshotJobData>('screenshots', {
      connection: redisConnection
    });
  }

  async enqueueScreenshot(data: ScreenshotJobData): Promise<string> {
    const job = await this.queue.add('capture', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: {
        age: 86400, // 24 hours
        count: 1000
      },
      removeOnFail: {
        age: 604800 // 7 days
      }
    });

    return job.id!;
  }

  async getJobStatus(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return {
      id: job.id,
      state,
      data: job.data,
      returnvalue: job.returnvalue
    };
  }

  async close() {
    await this.queue.close();
  }
}

function getRedisConnection(): { host: string; port: number; username?: string; password?: string } {
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

export function createScreenshotService(_fastify: FastifyInstance): ScreenshotService {
  return new ScreenshotService(getRedisConnection());
}
