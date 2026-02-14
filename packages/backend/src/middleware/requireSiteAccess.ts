import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload } from './authenticateJWT.js';

declare module 'fastify' {
  interface FastifyRequest {
    siteRole?: 'admin' | 'viewer' | null;
  }
}

export async function requireSiteAccess(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.user as JWTPayload | undefined;
  const siteId = request.params.id;

  if (!user) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  // Super admin can access all sites
  if (user.role === 'super_admin') {
    request.siteRole = 'admin';
    return;
  }

  // Check if user has access to this site
  const siteRole = user.sites[siteId];
  if (!siteRole) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'You do not have access to this site',
    });
  }

  request.siteRole = siteRole as 'admin' | 'viewer';
}
