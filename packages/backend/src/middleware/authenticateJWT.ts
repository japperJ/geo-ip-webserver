// @ts-nocheck
import type { FastifyRequest, FastifyReply } from 'fastify';

export interface JWTPayload {
  userId: string;
  email: string;
  role: 'super_admin' | 'user';
  sites: Record<string, string>; // siteId -> role
}

export async function authenticateJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Verify JWT from Authorization header
    await request.jwtVerify();
    
    // JWT payload is automatically attached to request.user by @fastify/jwt
    // We just need to ensure it exists
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or missing authentication token',
      });
    }
  } catch (error) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired authentication token',
    });
  }
}
