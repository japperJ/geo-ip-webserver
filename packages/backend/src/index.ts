import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import geoipPlugin from './plugins/geoip.js';
import { pool } from './db/index.js';
import { siteRoutes } from './routes/sites.js';
import { siteResolution } from './middleware/siteResolution.js';
import { ipAccessControl } from './middleware/ipAccessControl.js';
import { getClientIP } from './utils/getClientIP.js';
import { existsSync } from 'fs';

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

  // Register GeoIP plugin (optional if databases not present)
  const cityDbPath = process.env.GEOIP_CITY_DB_PATH || './data/GeoLite2-City.mmdb';
  const countryDbPath = process.env.GEOIP_COUNTRY_DB_PATH || './data/GeoLite2-Country.mmdb';
  
  if (existsSync(cityDbPath) && existsSync(countryDbPath)) {
    await server.register(geoipPlugin);
    server.log.info('GeoIP plugin registered');
  } else {
    server.log.warn('GeoIP databases not found - GeoIP functionality disabled');
  }

  // Register global middleware hooks (run on every request in order)
  // 1. Site resolution (attaches site to request)
  // 2. IP access control (uses site config for access decisions)
  server.addHook('onRequest', siteResolution);
  server.addHook('onRequest', ipAccessControl);

  // Health check endpoint
  server.get('/health', async () => {
    try {
      await pool.query('SELECT 1');
      return { status: 'healthy', database: 'connected' };
    } catch (error) {
      return { status: 'unhealthy', database: 'disconnected' };
    }
  });

  // Root route
  server.get('/', async () => {
    return { 
      name: 'Geo-IP Webserver API',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
  });

  // Register routes
  await server.register(siteRoutes, { prefix: '/api' });

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
