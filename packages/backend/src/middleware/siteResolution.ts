import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CacheService } from '../services/CacheService.js';

/**
 * Site resolution middleware - Phase 3: Multi-Site
 * 
 * Resolves site by hostname with multi-layer caching (LRU + Redis + DB)
 */
export function createSiteResolutionMiddleware(cacheService: CacheService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const pathname = request.url.split('?')[0];

    // Skip for health check and admin API routes
    if (pathname.startsWith('/health') || 
        pathname.startsWith('/api/') ||
        pathname.startsWith('/metrics') ||
        pathname === '/documentation' ||
        pathname.startsWith('/documentation/')) {
      return;
    }

    // Get hostname from request
    const hostname = request.hostname;

    if (!hostname) {
      request.log.error('No hostname in request');
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'No hostname provided',
      });
    }

    // Resolve site by hostname (with caching)
    const site = await cacheService.getSiteByHostname(hostname);

    if (!site) {
      request.log.warn({ hostname }, 'Site not found for hostname');
      return reply.code(404).send({
        error: 'Not Found',
        message: `No site configured for hostname: ${hostname}`,
      });
    }

    // Attach site to request
    request.site = site;

    request.log.debug(
      { siteId: site.id, siteName: site.name, hostname },
      'Site resolved via cache'
    );
  };
}
