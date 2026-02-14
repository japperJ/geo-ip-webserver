import type { FastifyInstance } from 'fastify';
import { AuthService } from '../services/AuthService.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireSiteAccess } from '../middleware/requireSiteAccess.js';

export async function siteRoleRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify);

  // Grant site role (super_admin only)
  fastify.post<{
    Params: { id: string };
    Body: { userId: string; role: 'admin' | 'viewer' };
  }>('/:id/roles', {
    onRequest: [fastify.authenticate, requireRole('super_admin')],
  }, async (request, reply) => {
    try {
      const { id: siteId } = request.params;
      const { userId, role } = request.body;
      const grantedBy = (request.user as any).userId;

      // Validate role
      if (!['admin', 'viewer'].includes(role)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Role must be "admin" or "viewer"',
        });
      }

      // Verify site exists
      const siteResult = await fastify.pg.query(
        'SELECT id FROM sites WHERE id = $1 AND deleted_at IS NULL',
        [siteId]
      );

      if (siteResult.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Site not found',
        });
      }

      // Verify user exists
      const userResult = await fastify.pg.query(
        'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found',
        });
      }

      const siteRole = await authService.grantSiteRole(siteId, userId, role, grantedBy);

      return reply.status(201).send({
        success: true,
        siteRole,
        message: `${role} role granted successfully`,
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Failed to grant site role');
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to grant site role',
      });
    }
  });

  // List site roles
  fastify.get<{
    Params: { id: string };
  }>('/:id/roles', {
    onRequest: [fastify.authenticate, requireSiteAccess],
  }, async (request, reply) => {
    try {
      const { id: siteId } = request.params;

      const roles = await authService.getSiteRoles(siteId);

      // Get user details for each role
      const rolesWithUsers = await Promise.all(
        roles.map(async (role) => {
          const userResult = await fastify.pg.query(
            'SELECT id, email, global_role FROM users WHERE id = $1',
            [role.user_id]
          );

          return {
            ...role,
            user: userResult.rows[0],
          };
        })
      );

      return reply.send({
        success: true,
        roles: rolesWithUsers,
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Failed to list site roles');
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to list site roles',
      });
    }
  });

  // Revoke site role (super_admin only)
  fastify.delete<{
    Params: { id: string; userId: string };
  }>('/:id/roles/:userId', {
    onRequest: [fastify.authenticate, requireRole('super_admin')],
  }, async (request, reply) => {
    try {
      const { id: siteId, userId } = request.params;

      await authService.revokeSiteRole(siteId, userId);

      return reply.send({
        success: true,
        message: 'Site role revoked successfully',
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Failed to revoke site role');
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to revoke site role',
      });
    }
  });
}
