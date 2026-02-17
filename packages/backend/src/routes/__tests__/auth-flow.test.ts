import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { authRoutes } from '../auth.js';
import { authenticateJWT } from '../../middleware/authenticateJWT.js';
import { testPool } from '../../tests/setup.js';

const TEST_PASSWORD = 'Password123!';

function getCookieHeader(setCookieHeader: string | string[] | undefined): string {
  if (!setCookieHeader) {
    throw new Error('Missing Set-Cookie header');
  }

  const rawCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  return rawCookie.split(';')[0];
}

async function buildAuthTestServer() {
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

  return app;
}

describe('auth flow integration', () => {
  beforeEach(async () => {
    await testPool.query('DELETE FROM user_site_roles');
    await testPool.query('DELETE FROM refresh_tokens');
    await testPool.query('DELETE FROM users');
  });

  it('proves register -> login -> refresh -> /me flow', async () => {
    const app = await buildAuthTestServer();

    try {
      const email = `phase-c-auth-${Date.now()}@example.com`;

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email,
          password: TEST_PASSWORD,
        },
      });

      expect(registerResponse.statusCode).toBe(201);
      expect(registerResponse.json()).toMatchObject({
        success: true,
        user: {
          email,
        },
      });

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

      const refreshCookie = getCookieHeader(loginResponse.headers['set-cookie']);
      const accessToken = loginResponse.json().accessToken as string;

      const meWithLoginTokenResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(meWithLoginTokenResponse.statusCode).toBe(200);
      expect(meWithLoginTokenResponse.json()).toMatchObject({
        success: true,
        user: {
          email,
        },
      });

      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: {
          cookie: refreshCookie,
        },
      });

      expect(refreshResponse.statusCode).toBe(200);
      expect(refreshResponse.json().accessToken).toEqual(expect.any(String));

      const refreshedAccessToken = refreshResponse.json().accessToken as string;

      const meWithRefreshedTokenResponse = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${refreshedAccessToken}`,
        },
      });

      expect(meWithRefreshedTokenResponse.statusCode).toBe(200);
      expect(meWithRefreshedTokenResponse.json()).toMatchObject({
        success: true,
        user: {
          email,
        },
      });
    } finally {
      await app.close();
    }
  });
});
