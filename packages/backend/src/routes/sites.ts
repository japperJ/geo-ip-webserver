// @ts-nocheck
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SiteService } from '../services/SiteService.js';
import { GeofenceService } from '../services/GeofenceService.js';
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
import { validateGPS } from '../utils/validateGPS.js';

export async function siteRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();
  const siteService = new SiteService(pool);
  const geofenceService = new GeofenceService(fastify);

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
  }, async (request, _reply) => {
    const user = request.user as JWTPayload;

    // Super admin sees all sites
    if (user.role === 'super_admin') {
      const result = await siteService.list(request.query);
      return {
        sites: result.sites,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
        },
      };
    }

    // Regular users see only assigned sites
    const siteIds = Object.keys(user.sites);
    if (siteIds.length === 0) {
      return {
        sites: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
        },
      };
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

    const total = parseInt(countResult.rows[0].count);
    return {
      sites: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
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

  // Validate GPS coordinates against site geofence (PUBLIC endpoint)
  server.post('/sites/:id/validate-location', {
    schema: {
      params: z.object({
        id: z.string().uuid(),
      }),
      body: z.object({
        gps_lat: z.number().min(-90).max(90),
        gps_lng: z.number().min(-180).max(180),
        gps_accuracy: z.number().min(0).optional(),
      }),
      response: {
        200: z.object({
          allowed: z.boolean(),
          reason: z.string().optional(),
          distance_km: z.number().optional(),
          site_name: z.string(),
          access_mode: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { gps_lat, gps_lng, gps_accuracy } = request.body;

    // Get site configuration
    const site = await siteService.getById(id);
    if (!site || !site.enabled) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Site not found or disabled',
      } as any);
    }

    // Check if geofencing is enabled
    if (site.access_mode === 'disabled' || site.access_mode === 'ip_only') {
      return reply.send({
        allowed: true,
        reason: 'geofencing_not_enabled',
        site_name: site.name,
        access_mode: site.access_mode,
      });
    }

    // Validate GPS coordinates
    const gpsValidation = validateGPS(gps_lat, gps_lng, gps_accuracy);
    if (!gpsValidation.valid) {
      return reply.send({
        allowed: false,
        reason: gpsValidation.error || 'invalid_gps_coordinates',
        site_name: site.name,
        access_mode: site.access_mode,
      });
    }

    // Check if site has geofence configured
    if (!site.geofence_type || (!site.geofence_polygon && !site.geofence_center)) {
      return reply.send({
        allowed: false,
        reason: 'geofence_not_configured',
        site_name: site.name,
        access_mode: site.access_mode,
      });
    }

    // Validate against geofence
    let result;
    if (site.geofence_type === 'polygon' && site.geofence_polygon) {
      result = await geofenceService.checkPolygonGeofence(
        { lat: gps_lat, lng: gps_lng, accuracy: gps_accuracy },
        site.geofence_polygon
      );
    } else if (site.geofence_type === 'radius' && site.geofence_center && site.geofence_radius_km) {
      result = await geofenceService.checkRadiusGeofence(
        { lat: gps_lat, lng: gps_lng, accuracy: gps_accuracy },
        site.geofence_center,
        site.geofence_radius_km
      );
    } else {
      return reply.send({
        allowed: false,
        reason: 'invalid_geofence_configuration',
        site_name: site.name,
        access_mode: site.access_mode,
      });
    }

    return reply.send({
      allowed: result.allowed,
      reason: result.reason,
      distance_km: result.distance,
      site_name: site.name,
      access_mode: site.access_mode,
    });
  });
}
