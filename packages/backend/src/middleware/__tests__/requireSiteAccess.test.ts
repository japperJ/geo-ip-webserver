import { describe, expect, it } from 'vitest';
import { requireSiteAccess } from '../requireSiteAccess.js';

function createReplyMock() {
  const payload: { statusCode?: number; body?: unknown } = {};

  const reply = {
    status(code: number) {
      payload.statusCode = code;
      return this;
    },
    send(body: unknown) {
      payload.body = body;
      return this;
    },
  };

  return { reply, payload };
}

describe('requireSiteAccess', () => {
  it('supports :siteId route param', async () => {
    const { reply, payload } = createReplyMock();
    const request: any = {
      user: {
        userId: 'u1',
        email: 'user@example.com',
        role: 'user',
        sites: {
          'site-1': 'viewer',
        },
      },
      params: {
        siteId: 'site-1',
      },
    };

    await requireSiteAccess(request, reply as any);

    expect(payload.statusCode).toBeUndefined();
    expect(request.siteRole).toBe('viewer');
  });

  it('supports legacy :id route param', async () => {
    const { reply, payload } = createReplyMock();
    const request: any = {
      user: {
        userId: 'u1',
        email: 'user@example.com',
        role: 'user',
        sites: {
          'site-2': 'admin',
        },
      },
      params: {
        id: 'site-2',
      },
    };

    await requireSiteAccess(request, reply as any);

    expect(payload.statusCode).toBeUndefined();
    expect(request.siteRole).toBe('admin');
  });

  it('returns 400 when site param is missing', async () => {
    const { reply, payload } = createReplyMock();
    const request: any = {
      user: {
        userId: 'u1',
        email: 'user@example.com',
        role: 'user',
        sites: {},
      },
      params: {},
    };

    await requireSiteAccess(request, reply as any);

    expect(payload.statusCode).toBe(400);
    expect(payload.body).toMatchObject({
      error: 'Bad Request',
    });
  });
});
