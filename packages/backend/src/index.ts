import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyEnv from '@fastify/env';
import fastifyPostgres from '@fastify/postgres';
import fastifyRedis from '@fastify/redis';
import fastifyCors from '@fastify/cors';

const envSchema = {
  type: 'object',
  required: ['DATABASE_URL', 'REDIS_HOST'],
  properties: {
    NODE_ENV: {
      type: 'string',
      default: 'development'
    },
    HOST: {
      type: 'string',
      default: '0.0.0.0'
    },
    PORT: {
      type: 'integer',
      default: 3000
    },
    LOG_LEVEL: {
      type: 'string',
      default: 'info'
    },
    DATABASE_URL: {
      type: 'string'
    },
    REDIS_HOST: {
      type: 'string'
    },
    REDIS_PORT: {
      type: 'integer',
      default: 6379
    }
  }
};

async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development' 
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined
    }
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Register environment validation
  await server.register(fastifyEnv, {
    schema: envSchema,
    dotenv: true
  });

  // Register CORS
  await server.register(fastifyCors, {
    origin: true,
    credentials: true
  });

  // Register PostgreSQL
  await server.register(fastifyPostgres, {
    connectionString: server.config.DATABASE_URL
  });

  // Register Redis
  await server.register(fastifyRedis, {
    host: server.config.REDIS_HOST,
    port: server.config.REDIS_PORT,
    closeClient: true
  });

  // Health check route
  server.get('/health', async () => {
    const dbCheck = await server.pg.query('SELECT 1 as ok');
    const redisCheck = await server.redis.ping();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbCheck.rows[0].ok === 1 ? 'connected' : 'disconnected',
      redis: redisCheck === 'PONG' ? 'connected' : 'disconnected'
    };
  });

  // Root route
  server.get('/', async () => {
    return { 
      name: 'Geo-IP Webserver API',
      version: '1.0.0',
      environment: server.config.NODE_ENV
    };
  });

  return server;
}

async function start() {
  try {
    const server = await buildServer();
    
    const address = await server.listen({
      port: server.config.PORT,
      host: server.config.HOST
    });
    
    server.log.info(`Server listening on ${address}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
