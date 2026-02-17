import type { FastifyInstance } from 'fastify';
import { AuthService } from '../services/AuthService.js';
import { requireRole } from '../middleware/requireRole.js';

export async function usersRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify);

  fastify.get<{ Querystring: { q?: string } }>(
    '/',
    {
      onRequest: [fastify.authenticate, requireRole('super_admin')],
    },
    async (request, reply) => {
      try {
        const users = await authService.listUsers(request.query.q);

        return reply.send({
          success: true,
          users,
        });
      } catch (error: any) {
        fastify.log.error({ error }, 'Failed to list users');

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list users',
        });
      }
    }
  );

  fastify.patch<{
    Params: { id: string };
    Body: { global_role: 'super_admin' | 'user' };
  }>(
    '/:id',
    {
      onRequest: [fastify.authenticate, requireRole('super_admin')],
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { global_role } = request.body;

        if (!['super_admin', 'user'].includes(global_role)) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'global_role must be "super_admin" or "user"',
          });
        }

        const updatedUser = await authService.updateUserGlobalRole(id, global_role);

        if (!updatedUser) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'User not found',
          });
        }

        return reply.send({
          success: true,
          user: updatedUser,
        });
      } catch (error: any) {
        fastify.log.error({ error }, 'Failed to update user role');

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update user role',
        });
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    {
      onRequest: [fastify.authenticate, requireRole('super_admin')],
    },
    async (request, reply) => {
      try {
        const { id } = request.params;

        const deleted = await authService.softDeleteUser(id);

        if (!deleted) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'User not found',
          });
        }

        return reply.send({
          success: true,
          message: 'User deleted successfully',
        });
      } catch (error: any) {
        fastify.log.error({ error }, 'Failed to delete user');

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete user',
        });
      }
    }
  );
}
