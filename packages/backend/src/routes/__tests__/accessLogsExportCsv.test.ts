import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { accessLogRoutes } from '../accessLogs.js';

const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';

const baseLogs = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    site_id: SITE_A,
    timestamp: new Date('2026-02-14T10:00:00.000Z'),
    ip_address: '192.168.1.0',
    user_agent: 'Mozilla/5.0',
    url: '/blocked',
    allowed: false,
    reason: 'ip_denylist',
    ip_country: 'US',
    ip_city: 'New York',
    ip_lat: 40.7,
    ip_lng: -74.0,
    gps_lat: null,
    gps_lng: null,
    gps_accuracy: null,
    screenshot_url: null,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    site_id: SITE_A,
    timestamp: new Date('2026-02-16T12:00:00.000Z'),
    ip_address: '10.0.0.0',
    user_agent: null,
    url: '/allowed',
    allowed: true,
    reason: 'passed',
    ip_country: 'CA',
    ip_city: 'Toronto',
    ip_lat: 43.6,
    ip_lng: -79.3,
    gps_lat: null,
    gps_lng: null,
    gps_accuracy: null,
    screenshot_url: null,
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    site_id: SITE_B,
    timestamp: new Date('2026-02-15T09:00:00.000Z'),
    ip_address: '172.16.0.0',
    user_agent: null,
    url: '/other-site',
    allowed: false,
    reason: 'country_denylist',
    ip_country: 'FR',
    ip_city: 'Paris',
    ip_lat: 48.8,
    ip_lng: 2.3,
    gps_lat: null,
    gps_lng: null,
    gps_accuracy: null,
    screenshot_url: null,
  },
];

function createAccessLogServiceMock() {
  return {
    query: async (filters: {
      site_id?: string;
      allowed?: boolean;
      start_date?: Date;
      end_date?: Date;
      ip?: string;
      page?: number;
      limit?: number;
    }) => {
      let filtered = [...baseLogs];

      if (filters.site_id) {
        filtered = filtered.filter((log) => log.site_id === filters.site_id);
      }

      if (filters.allowed !== undefined) {
        filtered = filtered.filter((log) => log.allowed === filters.allowed);
      }

      if (filters.start_date) {
        filtered = filtered.filter((log) => log.timestamp >= filters.start_date!);
      }

      if (filters.end_date) {
        filtered = filtered.filter((log) => log.timestamp <= filters.end_date!);
      }

      if (filters.ip) {
        filtered = filtered.filter((log) => log.ip_address.includes(filters.ip!));
      }

      filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      const page = filters.page || 1;
      const limit = filters.limit || 100;
      const offset = (page - 1) * limit;
      const logs = filtered.slice(offset, offset + limit);

      return {
        logs,
        total: filtered.length,
        page,
        limit,
      };
    },
    getById: async () => null,
  };
}

async function buildTestServer() {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('authenticate', async (request: any, reply: any) => {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (authHeader === 'Bearer super-admin') {
      request.user = {
        userId: '90000000-0000-4000-8000-000000000000',
        email: 'super@example.com',
        role: 'super_admin',
        sites: {},
      };
      return;
    }

    request.user = {
      userId: '10000000-0000-4000-8000-000000000000',
      email: 'viewer@example.com',
      role: 'user',
      sites: {
        [SITE_A]: 'viewer',
      },
    };
  });

  await app.register(accessLogRoutes as any, {
    prefix: '/api',
    accessLogService: createAccessLogServiceMock(),
  } as any);

  return app;
}

describe('access log export CSV route', () => {
  it('exports filtered CSV for an accessible site with attachment headers', async () => {
    const app = await buildTestServer();

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${SITE_A}/access-logs/export?allowed=false&ip=192.168&start_date=2026-02-14T00:00:00.000Z&end_date=2026-02-14T23:59:59.999Z&site_id=${SITE_B}`,
      headers: {
        authorization: 'Bearer viewer',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment; filename=');

    const lines = response.body.trim().split('\n');
    expect(lines[0]).toBe('id,site_id,timestamp,ip_address,user_agent,url,allowed,reason,ip_country,ip_city,ip_lat,ip_lng,gps_lat,gps_lng,gps_accuracy,screenshot_url');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('192.168.1.0');
    expect(lines[1]).not.toContain('/other-site');

    await app.close();
  });

  it('returns 403 when user does not have access to the site', async () => {
    const app = await buildTestServer();

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${SITE_B}/access-logs/export`,
      headers: {
        authorization: 'Bearer viewer',
      },
    });

    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it('allows super admin to export any site', async () => {
    const app = await buildTestServer();

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${SITE_B}/access-logs/export?allowed=false`,
      headers: {
        authorization: 'Bearer super-admin',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('/other-site');

    await app.close();
  });
});
