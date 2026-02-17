import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AccessLogService } from '../services/AccessLogService.js';
import { pool } from '../db/index.js';
import { requireSiteAccess } from '../middleware/requireSiteAccess.js';
import type { AccessLog } from '../models/AccessLog.js';

const booleanQueryValue = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean());

// Query schema
const accessLogsQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
  allowed: booleanQueryValue.optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  ip: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

const accessLogsExportQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
  allowed: booleanQueryValue.optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  ip: z.string().optional(),
});

const accessLogsExportParamsSchema = z.object({
  siteId: z.string().uuid(),
});

// Log ID param schema
const logIdParamSchema = z.object({
  id: z.string().uuid(),
});

interface AccessLogRoutesOptions {
  accessLogService?: Pick<AccessLogService, 'query' | 'getById'>;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const serialized = value instanceof Date ? value.toISOString() : String(value);
  const needsQuoting = serialized.includes(',') || serialized.includes('"') || serialized.includes('\n') || serialized.includes('\r');

  if (!needsQuoting) {
    return serialized;
  }

  return `"${serialized.replace(/"/g, '""')}"`;
}

function toCsv(logs: AccessLog[]): string {
  const columns: Array<keyof AccessLog> = [
    'id',
    'site_id',
    'timestamp',
    'ip_address',
    'user_agent',
    'url',
    'allowed',
    'reason',
    'ip_country',
    'ip_city',
    'ip_lat',
    'ip_lng',
    'gps_lat',
    'gps_lng',
    'gps_accuracy',
    'screenshot_url',
  ];

  const header = columns.join(',');
  const rows = logs.map((log) => columns.map((column) => escapeCsvValue(log[column])).join(','));

  return `${header}\n${rows.join('\n')}`;
}

export async function accessLogRoutes(fastify: FastifyInstance, options: AccessLogRoutesOptions = {}) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();
  const accessLogService = options.accessLogService || new AccessLogService(pool);

  // List access logs
  server.get('/access-logs', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: accessLogsQuerySchema,
    },
  }, async (request, _reply) => {
    const result = await accessLogService.query(request.query);
    
    // Transform to match frontend expectations
    return {
      logs: result.logs,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    };
  });

  // Export site access logs as CSV
  server.get('/sites/:siteId/access-logs/export', {
    onRequest: [fastify.authenticate, requireSiteAccess],
    schema: {
      params: accessLogsExportParamsSchema,
      querystring: accessLogsExportQuerySchema,
    },
  }, async (request, reply) => {
    const { siteId } = request.params;
    const { allowed, start_date, end_date, ip } = request.query;
    const logs: AccessLog[] = [];

    let page = 1;
    const limit = 1000;

    let hasMore = true;

    while (hasMore) {
      const result = await accessLogService.query({
        site_id: siteId,
        allowed,
        start_date,
        end_date,
        ip,
        page,
        limit,
      });

      logs.push(...result.logs);

      hasMore = logs.length < result.total && result.logs.length > 0;
      if (hasMore) {
        page += 1;
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `access-logs-${siteId}-${timestamp}.csv`;
    const csv = toCsv(logs);

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    return reply.send(csv);
  });

  // Get single access log
  server.get('/access-logs/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      params: logIdParamSchema,
    },
  }, async (request, reply) => {
    const log = await accessLogService.getById(request.params.id);
    
    if (!log) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Access log not found',
      });
    }
    
    return log;
  });
}
