import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { authRoutes } from '../auth.js';
import { siteRoleRoutes } from '../siteRoles.js';
import { authenticateJWT } from '../../middleware/authenticateJWT.js';
import { testPool } from '../../tests/setup.js';

const TEST_PASSWORD = 'Password123!';

interface AuthSession {
  user: {
    id: string;
    email: string;
    global_role: 'super_admin' | 'user';
  };
  accessToken: string;
}

async function buildDelegationTestServer() {
  const app = Fastify({ logger: false });

  (app as any).decorate('pg', testPool);

  await app.register(cookie, {
    secret: 'test-cookie-secret',
  });

  await app.register(jwt, {
    secret: 'test-jwt-secret-phase-c-gap-closure',
  });

  (app as any).decorate('authenticate', authenticateJWT);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(siteRoleRoutes, { prefix: '/api/sites' });

  return app;
}

async function login(app: FastifyInstance, email: string): Promise<AuthSession> {
  const loginResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      email,
      password: TEST_PASSWORD,
    },
  });

  expect(loginResponse.statusCode).toBe(200);
  expect(loginResponse.json().accessToken).toEqual(expect.any(String));

  return {
    user: loginResponse.json().user,
    accessToken: loginResponse.json().accessToken,
  };
}

async function registerAndLogin(app: FastifyInstance, email: string): Promise<AuthSession> {
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email,
      password: TEST_PASSWORD,
    },
  });

  expect(registerResponse.statusCode).toBe(201);

  return login(app, email);
}

describe('site delegation flow integration', () => {
  beforeEach(async () => {
    await testPool.query('DELETE FROM user_site_roles');
    await testPool.query('DELETE FROM refresh_tokens');
    await testPool.query('DELETE FROM users');
    await testPool.query('DELETE FROM sites');
  });

  it('proves grant/revoke/read/deny flow with fresh-token revoke evidence', async () => {
    const app = await buildDelegationTestServer();

    try {
      const siteInsertResult = await testPool.query<{ id: string }>(
        `INSERT INTO sites (slug, name, access_mode)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [`phase-c-site-${Date.now()}`, 'Phase C Delegation Site', 'ip_only']
      );

      const siteId = siteInsertResult.rows[0].id;
      const uniqueSuffix = Date.now();

      const superAdmin = await registerAndLogin(app, `super-${uniqueSuffix}@example.com`);
      const delegated = await registerAndLogin(app, `delegated-${uniqueSuffix}@example.com`);
      const outsider = await registerAndLogin(app, `outsider-${uniqueSuffix}@example.com`);

      const grantResponse = await app.inject({
        method: 'POST',
        url: `/api/sites/${siteId}/roles`,
        headers: {
          authorization: `Bearer ${superAdmin.accessToken}`,
        },
        payload: {
          userId: delegated.user.id,
          role: 'viewer',
        },
      });

      expect(grantResponse.statusCode).toBe(201);

      const delegatedWithGrantedRole = await login(app, delegated.user.email);

      const delegatedReadResponse = await app.inject({
        method: 'GET',
        url: `/api/sites/${siteId}/roles`,
        headers: {
          authorization: `Bearer ${delegatedWithGrantedRole.accessToken}`,
        },
      });

      expect(delegatedReadResponse.statusCode).toBe(200);
      expect(delegatedReadResponse.json().roles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: delegated.user.id,
            site_id: siteId,
            role: 'viewer',
          }),
        ])
      );

      const delegatedGrantDeniedResponse = await app.inject({
        method: 'POST',
        url: `/api/sites/${siteId}/roles`,
        headers: {
          authorization: `Bearer ${delegatedWithGrantedRole.accessToken}`,
        },
        payload: {
          userId: outsider.user.id,
          role: 'viewer',
        },
      });

      expect(delegatedGrantDeniedResponse.statusCode).toBe(403);

      const outsiderReadDeniedResponse = await app.inject({
        method: 'GET',
        url: `/api/sites/${siteId}/roles`,
        headers: {
          authorization: `Bearer ${outsider.accessToken}`,
        },
      });

      expect(outsiderReadDeniedResponse.statusCode).toBe(403);

      const revokeResponse = await app.inject({
        method: 'DELETE',
        url: `/api/sites/${siteId}/roles/${delegated.user.id}`,
        headers: {
          authorization: `Bearer ${superAdmin.accessToken}`,
        },
      });

      expect(revokeResponse.statusCode).toBe(200);

      const delegatedAfterRevoke = await login(app, delegated.user.email);

      const delegatedReadAfterRevokeResponse = await app.inject({
        method: 'GET',
        url: `/api/sites/${siteId}/roles`,
        headers: {
          authorization: `Bearer ${delegatedAfterRevoke.accessToken}`,
        },
      });

      expect(delegatedReadAfterRevokeResponse.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
