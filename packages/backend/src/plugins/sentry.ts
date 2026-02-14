import * as Sentry from '@sentry/node';
import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

async function sentryPlugin(fastify: FastifyInstance) {
  // Only initialize if DSN is provided
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    fastify.log.info('Sentry DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });

  fastify.log.info('Sentry initialized');

  // Add error handler hook
  fastify.addHook('onError', async (request, reply, error) => {
    Sentry.withScope((scope) => {
      // Add request context
      scope.setContext('request', {
        method: request.method,
        url: request.url,
        headers: request.headers,
        ip: request.ip,
      });

      // Add user context if available
      if ((request as any).user) {
        scope.setUser({
          id: (request as any).user.id,
          email: (request as any).user.email,
        });
      }

      // Add site context if available
      if ((request as any).site) {
        scope.setContext('site', {
          id: (request as any).site.id,
          name: (request as any).site.name,
          hostname: (request as any).site.hostname,
        });
      }

      // Add tags
      scope.setTag('route', request.routeOptions?.url || 'unknown');
      scope.setTag('status_code', reply.statusCode);

      // Capture exception
      Sentry.captureException(error);
    });
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await Sentry.close(2000);
  });
}

export default fastifyPlugin(sentryPlugin, {
  name: 'sentry',
  fastify: '5.x',
});
