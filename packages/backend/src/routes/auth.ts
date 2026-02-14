import type { FastifyInstance } from 'fastify';
import { AuthService } from '../services/AuthService.js';

export async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify);

  // Register
  fastify.post<{
    Body: { email: string; password: string };
  }>('/register', async (request, reply) => {
    try {
      const { email, password } = request.body;

      // Check if this is the first user (make them super_admin)
      const countResult = await fastify.pg.query(
        'SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL'
      );
      const userCount = parseInt(countResult.rows[0].count);
      const globalRole = userCount === 0 ? 'super_admin' : 'user';

      const user = await authService.createUser({ email, password, global_role: globalRole });

      return reply.status(201).send({
        success: true,
        user,
        message: userCount === 0 ? 'First user created as super admin' : 'User created successfully',
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Registration failed');
      
      if (error.code === '23505') { // Unique violation
        return reply.status(409).send({
          error: 'Conflict',
          message: 'Email already registered',
        });
      }

      return reply.status(400).send({
        error: 'Bad Request',
        message: error.message || 'Registration failed',
      });
    }
  });

  // Login
  fastify.post<{
    Body: { email: string; password: string };
  }>('/login', async (request, reply) => {
    try {
      const { email, password } = request.body;
      const result = await authService.login(email, password);

      // Set refresh token as HttpOnly cookie
      reply.setCookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return reply.send({
        success: true,
        accessToken: result.accessToken,
        user: result.user,
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Login failed');
      
      return reply.status(401).send({
        error: 'Unauthorized',
        message: error.message || 'Invalid credentials',
      });
    }
  });

  // Refresh access token
  fastify.post('/refresh', async (request, reply) => {
    try {
      const refreshToken = request.cookies.refreshToken;

      if (!refreshToken) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'No refresh token provided',
        });
      }

      const accessToken = await authService.refreshAccessToken(refreshToken);

      return reply.send({
        success: true,
        accessToken,
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Token refresh failed');
      
      return reply.status(401).send({
        error: 'Unauthorized',
        message: error.message || 'Invalid or expired refresh token',
      });
    }
  });

  // Logout
  fastify.post('/logout', async (request, reply) => {
    try {
      const refreshToken = request.cookies.refreshToken;

      if (refreshToken) {
        await authService.revokeRefreshToken(refreshToken);
      }

      // Clear cookie
      reply.clearCookie('refreshToken', { path: '/' });

      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Logout failed');
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Logout failed',
      });
    }
  });

  // Get current user
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const userId = (request.user as any).userId;
      const user = await authService.getUserById(userId);

      if (!user) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found',
        });
      }

      return reply.send({
        success: true,
        user,
      });
    } catch (error: any) {
      fastify.log.error({ error }, 'Failed to get user');
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get user',
      });
    }
  });
}
