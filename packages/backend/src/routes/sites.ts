// @ts-nocheck
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SiteService } from '../services/SiteService.js';
import { pool } from '../db/index.js';
import {
  createSiteSchema,
  updateSiteSchema,
  listSitesQuerySchema,
  siteIdParamSchema,
  siteSchema,
  listSitesResponseSchema,
} from '../schemas/site.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireSiteAccess } from '../middleware/requireSiteAccess.js';
import type { JWTPayload } from '../middleware/authenticateJWT.js';

export async function siteRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();
  const siteService = new SiteService(pool);

  // Create site (super_admin only)
  server.post('/sites', {
    onRequest: [fastify.authenticate, requireRole('super_admin')],
    schema: {
      body: createSiteSchema,
      response: {
        201: siteSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const site = await siteService.create(request.body);
      return reply.code(201).send(site);
    } catch (error: any) {
      if (error.code === '23505') {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Slug or hostname already exists',
        });
      }
      throw error;
    }
  });

  // List sites (filter by user's accessible sites)
  server.get('/sites', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: listSitesQuerySchema,
      response: {
        200: listSitesResponseSchema,
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;

    // Super admin sees all sites
    if (user.role === 'super_admin') {
      const result = await siteService.list(request.query);
      return result;
    }

    // Regular users see only assigned sites
    const siteIds = Object.keys(user.sites);
    if (siteIds.length === 0) {
      return { sites: [], total: 0, page: 1, limit: 10 };
    }

    const page = request.query.page || 1;
    const limit = request.query.limit || 10;
    const offset = (page - 1) * limit;

    // Filter sites by IDs
    const result = await fastify.pg.query(
      `SELECT * FROM sites 
       WHERE id = ANY($1) 
       AND deleted_at IS NULL 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [siteIds, limit, offset]
    );

    const countResult = await fastify.pg.query(
      'SELECT COUNT(*) as count FROM sites WHERE id = ANY($1) AND deleted_at IS NULL',
      [siteIds]
    );

    return {
      sites: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    };
  });

  // Get site by ID (requires site access)
  server.get('/sites/:id', {
    onRequest: [fastify.authenticate, requireSiteAccess],
    schema: {
      params: siteIdParamSchema,
      response: {
        200: siteSchema,
      },
    },
  }, async (request, reply) => {
    const site = await siteService.getById(request.params.id);
    
    if (!site) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Site not found',
      } as any);
    }
    
    return site;
  });

  // Update site (requires admin role)
  server.patch('/sites/:id', {
    onRequest: [fastify.authenticate, requireSiteAccess],
    schema: {
      params: siteIdParamSchema,
      body: updateSiteSchema,
      response: {
        200: siteSchema,
      },
    },
  }, async (request, reply) => {
    // Check if user has admin role for this site
    if (request.siteRole !== 'admin') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin role required to update site',
      } as any);
    }

    const site = await siteService.update(request.params.id, request.body);
    
    // Invalidate cache after update
    if (site?.hostname) {
      await fastify.cacheService.invalidateSiteCache(site.hostname);
    }
    
    if (!site) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Site not found',
      } as any);
    }
    
    return site;
  });

  // Delete site (super_admin only)
  server.delete('/sites/:id', {
    onRequest: [fastify.authenticate, requireRole('super_admin')],
    schema: {
      params: siteIdParamSchema,
      response: {
        204: z.null(),
      },
    },
  }, async (request, reply) => {
    const deleted = await siteService.delete(request.params.id);
    
    if (!deleted) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Site not found',
      } as any);
    }
    
    return reply.code(204).send(null as any);
  });
}
