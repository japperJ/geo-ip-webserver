// @ts-nocheck
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import redis from '@fastify/redis';
import geoipPlugin from './plugins/geoip.js';
import { pool } from './db/index.js';
import { siteRoutes } from './routes/sites.js';
import { accessLogRoutes } from './routes/accessLogs.js';
import { authRoutes } from './routes/auth.js';
import { siteRoleRoutes } from './routes/siteRoles.js';
import { gdprRoutes } from './routes/gdpr.js';
import { createSiteResolutionMiddleware } from './middleware/siteResolution.js';
import { ipAccessControl } from './middleware/ipAccessControl.js';
import { authenticateJWT } from './middleware/authenticateJWT.js';
import { CacheService } from './services/CacheService.js';
import { createScreenshotService } from './services/ScreenshotService.js';
import { AccessLogService } from './services/AccessLogService.js';
import { startLogRetentionJob } from './jobs/logRetention.js';
import { getClientIP } from './utils/getClientIP.js';
import { existsSync } from 'fs';

// Extend Fastify instance type
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authenticateJWT;
    cacheService: CacheService;
    pg: typeof pool;
  }
}

async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development' 
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined
    },
    trustProxy: true, // Required for X-Forwarded-For
  }).withTypeProvider<ZodTypeProvider>();

  // Set validator and serializer compilers
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Register plugins
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  await server.register(helmet, {
    contentSecurityPolicy: false, // Will configure in Phase 5
  });

  // Decorate with pg pool (instead of plugin for Fastify 5 compatibility)
  server.decorate('pg', pool);

  // Register Redis plugin
  await server.register(redis, {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  // Register cookie plugin (for refresh tokens)
  await server.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'change-this-secret-in-production',
  });

  // Register JWT plugin
  await server.register(jwt, {
    secret: process.env.JWT_SECRET || 'change-this-secret-in-production',
  });

  // Register authenticate decorator
  server.decorate('authenticate', authenticateJWT);

  // Initialize cache service
  const cacheService = new CacheService(server);
  server.decorate('cacheService', cacheService);

  // Initialize screenshot service (Phase 4)
  const screenshotService = createScreenshotService(server);
  
  // Initialize access log service and inject screenshot service
  const accessLogService = new AccessLogService(pool);
  accessLogService.setScreenshotService(screenshotService);

  // Register GeoIP plugin (optional if databases not present)
  const cityDbPath = process.env.GEOIP_CITY_DB_PATH || './data/GeoLite2-City.mmdb';
  const countryDbPath = process.env.GEOIP_COUNTRY_DB_PATH || './data/GeoLite2-Country.mmdb';
  
  if (existsSync(cityDbPath) && existsSync(countryDbPath)) {
    await server.register(geoipPlugin);
    server.log.info('GeoIP plugin registered');
  } else {
    server.log.warn('GeoIP databases not found - GeoIP functionality disabled');
  }

  // Warm cache on startup
  server.addHook('onReady', async () => {
    await cacheService.warmCache();
  });

  // Register global middleware hooks (run on every request in order)
  // 1. Site resolution (attaches site to request) - uses cache service
  // 2. IP access control (uses site config for access decisions)
  const siteResolutionMiddleware = createSiteResolutionMiddleware(cacheService);
  server.addHook('onRequest', siteResolutionMiddleware);
  server.addHook('onRequest', ipAccessControl);

  // Health check endpoint
  server.get('/health', async () => {
    try {
      await server.pg.query('SELECT 1');
      const redisHealth = await server.redis.ping();
      return { 
        status: 'healthy', 
        database: 'connected',
        redis: redisHealth === 'PONG' ? 'connected' : 'disconnected',
      };
    } catch (error) {
      return { status: 'unhealthy', database: 'disconnected', error: String(error) };
    }
  });

  // Metrics endpoint
  server.get('/metrics', async () => {
    const cacheStats = cacheService.getStats();
    return {
      cache: cacheStats,
    };
  });

  // Root route
  server.get('/', async () => {
    return { 
      name: 'Geo-IP Webserver API',
      version: '1.0.0',
      phase: '4 - Artifacts & GDPR Compliance',
      environment: process.env.NODE_ENV || 'development'
    };
  });

  // Register routes
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(siteRoutes, { prefix: '/api' });
  await server.register(siteRoleRoutes, { prefix: '/api/sites' });
  await server.register(accessLogRoutes, { prefix: '/api' });
  await server.register(gdprRoutes); // Phase 4: GDPR routes

  // Test route for IP access control (can be removed after testing)
  server.get('/test-protected', async (request) => {
    return {
      message: 'Access granted!',
      clientIP: getClientIP(request),
      site: request.site?.name,
    };
  });

  // GeoIP lookup route (only if plugin loaded)
  if (existsSync(cityDbPath) && existsSync(countryDbPath)) {
    server.get('/geoip/:ip', async (request, reply) => {
      const { ip } = request.params as { ip: string };
      const location = server.geoip.lookup(ip);
      
      if (!location) {
        return reply.code(404).send({ error: 'Location not found for IP' });
      }
      
      return location;
    });
    
    // GeoIP stats route
    server.get('/geoip/stats', async () => {
      return server.geoip.getCacheStats();
    });
  }

  // Manual trigger for log retention (dev only)
  if (process.env.NODE_ENV !== 'production') {
    server.post('/admin/trigger-log-retention', async () => {
      const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '90');
      
      const result = await pool.query(`
        SELECT COUNT(*) 
        FROM access_logs 
        WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'
      `);

      const count = parseInt(result.rows[0].count);
      
      return {
        message: 'Log retention job triggered',
        would_delete: count,
        retention_days: retentionDays,
      };
    });
  }

  // Global error handler
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);

    // Validation errors
    if (error.validation) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Validation failed',
        details: error.validation,
      });
    }

    // Database errors
    if ((error as any).code === '23505') {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Resource already exists',
      });
    }

    // Default 500 error
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    
    // Start cron jobs
    startLogRetentionJob();
    
    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    server.log.info(`Server listening on http://${host}:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
