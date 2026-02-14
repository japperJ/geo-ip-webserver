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

export function createScreenshotService(fastify: FastifyInstance): ScreenshotService {
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6380');

  return new ScreenshotService({
    host: redisHost,
    port: redisPort
  });
}
