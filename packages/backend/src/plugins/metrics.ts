import { FastifyRequest, FastifyReply } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import client from 'prom-client';

// Create Prometheus registry
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop lag)
client.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const cacheHitRate = new client.Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate (0-1)',
  registers: [register],
});

export const cacheSizeGauge = new client.Gauge({
  name: 'site_cache_size',
  help: 'Number of sites in cache',
  registers: [register],
});

export const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['query_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const accessControlDecisions = new client.Counter({
  name: 'access_control_decisions_total',
  help: 'Total number of access control decisions',
  labelNames: ['decision', 'reason'],
  registers: [register],
});

export const gpsAccuracyHistogram = new client.Histogram({
  name: 'gps_accuracy_meters',
  help: 'GPS accuracy in meters',
  buckets: [10, 20, 50, 100, 200, 500, 1000],
  registers: [register],
});

async function metricsPlugin(fastify: any) {
  // Add request timing hook
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    (request as any).startTime = Date.now();
  });

  // Add response metrics hook
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const duration = (Date.now() - (request as any).startTime) / 1000;
    const route = request.routeOptions?.url || request.url;
    const method = request.method;
    const statusCode = reply.statusCode.toString();

    // Record metrics
    httpRequestCounter.inc({ method, route, status_code: statusCode });
    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
  });

  // Expose metrics endpoint
  fastify.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });
}

export default fastifyPlugin(metricsPlugin, {
  name: 'prometheus-metrics',
  fastify: '5.x',
});

export { register };
