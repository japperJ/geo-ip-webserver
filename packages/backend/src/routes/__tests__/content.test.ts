import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { contentRoutes } from '../content.js';
import { gpsAccessControl } from '../../middleware/gpsAccessControl.js';

const SITE_ID = '11111111-1111-4111-8111-111111111111';

const GEO_ONLY_SITE = {
  id: SITE_ID,
  slug: 'demo-site',
  hostname: null,
  name: 'Demo Site',
  access_mode: 'geo_only',
  ip_allowlist: null,
  ip_denylist: null,
  country_allowlist: null,
  country_denylist: null,
  block_vpn_proxy: false,
  geofence_type: null,
  geofence_polygon: null,
  geofence_center: null,
  geofence_radius_km: null,
  enabled: true,
  created_at: new Date('2026-02-15T00:00:00.000Z'),
  updated_at: new Date('2026-02-15T00:00:00.000Z'),
} as const;

function createContentServiceMock() {
  return {
    listSiteContent: async () => [
      {
        key: `sites/${SITE_ID}/content/guide.pdf`,
        filename: 'guide.pdf',
        size: 1024,
        lastModified: new Date('2026-02-15T00:00:00.000Z'),
      },
    ],
    getDownloadUrl: async (_siteId: string, key: string) => `https://download.example/${encodeURIComponent(key)}`,
    uploadSiteContent: async (_siteId: string, input: { filename: string }) => ({
      key: `sites/${SITE_ID}/content/${input.filename}`,
      filename: input.filename,
      location: `s3://site-assets/sites/${SITE_ID}/content/${input.filename}`,
    }),
    deleteSiteContent: async () => undefined,
    getDownloadUrlByFilename: async (_siteId: string, filename: string) => `https://public.example/${filename}`,
  };
}

function buildAuthPayload(role: 'admin' | 'viewer') {
  return {
    userId: '22222222-2222-2222-2222-222222222222',
    email: 'user@example.com',
    role: 'user',
    sites: {
      [SITE_ID]: role,
    },
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

    const role = authHeader === 'Bearer admin' ? 'admin' : 'viewer';
    request.user = buildAuthPayload(role);
  });

  await app.register(contentRoutes as any, {
    contentService: createContentServiceMock(),
  } as any);

  return app;
}

async function buildPublicGpsProtectedTestServer() {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('authenticate', async () => {
    return;
  });

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0];

    if (!pathname.startsWith('/s/')) {
      return;
    }

    request.site = GEO_ONLY_SITE as any;

    await gpsAccessControl(request, reply, {
      site: request.site,
      geoipService: undefined,
      geofenceService: {} as any,
    });
  });

  await app.register(contentRoutes as any, {
    contentService: createContentServiceMock(),
  } as any);

  return app;
}

describe('content routes', () => {
  it('allows viewer to list content and get download URL', async () => {
    const app = await buildTestServer();

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/sites/${SITE_ID}/content`,
      headers: { authorization: 'Bearer viewer' },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items).toHaveLength(1);

    const downloadResponse = await app.inject({
      method: 'GET',
      url: `/api/sites/${SITE_ID}/content/download?key=${encodeURIComponent(`sites/${SITE_ID}/content/guide.pdf`)}`,
      headers: { authorization: 'Bearer viewer' },
    });

    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.json().url).toContain('https://download.example/');

    await app.close();
  });

  it('denies viewer upload and delete', async () => {
    const app = await buildTestServer();

    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${SITE_ID}/content/upload`,
      headers: { authorization: 'Bearer viewer' },
      payload: {
        filename: 'guide.pdf',
        contentBase64: Buffer.from('viewer-content').toString('base64'),
      },
    });

    expect(uploadResponse.statusCode).toBe(403);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${SITE_ID}/content/${encodeURIComponent(`sites/${SITE_ID}/content/guide.pdf`)}`,
      headers: { authorization: 'Bearer viewer' },
    });

    expect(deleteResponse.statusCode).toBe(403);

    await app.close();
  });

  it('allows admin upload/delete and public redirect route', async () => {
    const app = await buildTestServer();

    const adminUploadResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${SITE_ID}/content/upload`,
      headers: { authorization: 'Bearer admin' },
      payload: {
        filename: 'guide.pdf',
        contentBase64: Buffer.from('admin-content').toString('base64'),
        contentType: 'application/pdf',
      },
    });

    expect(adminUploadResponse.statusCode).toBe(201);

    const adminDeleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${SITE_ID}/content/${encodeURIComponent(`sites/${SITE_ID}/content/guide.pdf`)}`,
      headers: { authorization: 'Bearer admin' },
    });

    expect(adminDeleteResponse.statusCode).toBe(204);

    const publicResponse = await app.inject({
      method: 'GET',
      url: `/s/${SITE_ID}/content/guide.pdf`,
    });

    expect(publicResponse.statusCode).toBe(302);
    expect(publicResponse.headers.location).toContain('https://public.example/guide.pdf');

    await app.close();
  });

  it('returns 403 with gps_required for public route when GPS headers are missing', async () => {
    const app = await buildPublicGpsProtectedTestServer();

    const response = await app.inject({
      method: 'GET',
      url: `/s/${SITE_ID}/content/guide.pdf`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      reason: 'gps_required',
    });

    await app.close();
  });
});
