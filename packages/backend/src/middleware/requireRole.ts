import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload } from './authenticateJWT.js';

export function requireRole(...allowedRoles: Array<'super_admin' | 'user'>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as JWTPayload | undefined;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Requires one of the following roles: ${allowedRoles.join(', ')}`,
      });
    }
  };
}
