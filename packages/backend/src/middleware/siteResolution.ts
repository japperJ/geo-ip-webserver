import { FastifyRequest, FastifyReply } from 'fastify';
import { SiteService } from '../services/SiteService.js';
import { pool } from '../db/index.js';

const siteService = new SiteService(pool);

/**
 * Site resolution middleware (MVP: Single site mode)
 * 
 * For MVP, we'll load the first enabled site from database.
 * In Phase 3 (Multi-Site), this will resolve by hostname.
 */
export async function siteResolution(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Skip for health check and admin API routes
  if (request.url.startsWith('/health') || request.url.startsWith('/api/')) {
    return;
  }

  // MVP: Load first enabled site
  // TODO Phase 3: Resolve by request.hostname
  const result = await siteService.list({ limit: 1 });
  
  if (result.sites.length === 0) {
    request.log.error('No sites configured');
    return reply.code(503).send({
      error: 'Service Unavailable',
      message: 'No sites configured',
    });
  }

  // Attach site to request
  request.site = result.sites[0];
  
  request.log.debug({ siteId: request.site.id, siteName: request.site.name }, 'Site resolved');
}
