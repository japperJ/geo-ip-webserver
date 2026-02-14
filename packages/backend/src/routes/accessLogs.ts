import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AccessLogService } from '../services/AccessLogService.js';
import { pool } from '../db/index.js';

// Query schema
const accessLogsQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
  allowed: z.coerce.boolean().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  ip: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

// Log ID param schema
const logIdParamSchema = z.object({
  id: z.string().uuid(),
});

export async function accessLogRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();
  const accessLogService = new AccessLogService(pool);

  // List access logs
  server.get('/access-logs', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: accessLogsQuerySchema,
    },
  }, async (request, reply) => {
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
