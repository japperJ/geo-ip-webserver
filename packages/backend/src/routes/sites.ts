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

export async function siteRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();
  const siteService = new SiteService(pool);

  // Create site
  server.post('/sites', {
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

  // List sites
  server.get('/sites', {
    schema: {
      querystring: listSitesQuerySchema,
      response: {
        200: listSitesResponseSchema,
      },
    },
  }, async (request, reply) => {
    const result = await siteService.list(request.query);
    return result;
  });

  // Get site by ID
  server.get('/sites/:id', {
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
      });
    }
    
    return site;
  });

  // Update site
  server.patch('/sites/:id', {
    schema: {
      params: siteIdParamSchema,
      body: updateSiteSchema,
      response: {
        200: siteSchema,
      },
    },
  }, async (request, reply) => {
    const site = await siteService.update(request.params.id, request.body);
    
    if (!site) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Site not found',
      });
    }
    
    return site;
  });

  // Delete site
  server.delete('/sites/:id', {
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
      });
    }
    
    return reply.code(204).send();
  });
}

