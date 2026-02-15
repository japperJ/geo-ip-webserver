import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContentService } from '../services/ContentService.js';
import { requireSiteAccess } from '../middleware/requireSiteAccess.js';

interface ContentRoutesOptions {
  contentService?: ContentService;
}

const siteIdParamSchema = z.object({
  siteId: z.string().uuid(),
});

const uploadContentBodySchema = z.object({
  filename: z.string().min(1),
  contentBase64: z.string().min(1),
  contentType: z.string().min(1).optional(),
});

const downloadUrlQuerySchema = z.object({
  key: z.string().min(1),
});

const publicContentParamSchema = z.object({
  siteId: z.string().uuid(),
  filename: z.string().min(1),
});

export async function contentRoutes(fastify: FastifyInstance, options: ContentRoutesOptions = {}) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();
  const service = options.contentService || new ContentService();

  server.get('/api/sites/:siteId/content', {
    onRequest: [fastify.authenticate, requireSiteAccess],
    schema: {
      params: siteIdParamSchema,
    },
  }, async (request) => {
    const { siteId } = request.params;
    const items = await service.listSiteContent(siteId);

    return { items };
  });

  server.get('/api/sites/:siteId/content/download', {
    onRequest: [fastify.authenticate, requireSiteAccess],
    schema: {
      params: siteIdParamSchema,
      querystring: downloadUrlQuerySchema,
    },
  }, async (request, reply) => {
    const { siteId } = request.params;

    try {
      const url = await service.getDownloadUrl(siteId, request.query.key, 300);
      return { url };
    } catch {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid content key',
      } as any);
    }
  });

  server.post('/api/sites/:siteId/content/upload', {
    onRequest: [fastify.authenticate, requireSiteAccess],
    schema: {
      params: siteIdParamSchema,
      body: uploadContentBodySchema,
    },
  }, async (request, reply) => {
    if (request.siteRole !== 'admin') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin role required to upload content',
      } as any);
    }

    let decodedContent: Buffer;
    try {
      decodedContent = Buffer.from(request.body.contentBase64, 'base64');
    } catch {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid file payload',
      } as any);
    }

    if (!decodedContent.length) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'File content is required',
      } as any);
    }

    const uploaded = await service.uploadSiteContent(request.params.siteId, {
      filename: request.body.filename,
      data: decodedContent,
      contentType: request.body.contentType,
    });

    return reply.code(201).send(uploaded);
  });

  server.delete('/api/sites/:siteId/content/:key(.*)', {
    onRequest: [fastify.authenticate, requireSiteAccess],
    schema: {
      params: z.object({
        siteId: z.string().uuid(),
        key: z.string().min(1),
      }),
    },
  }, async (request, reply) => {
    if (request.siteRole !== 'admin') {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin role required to delete content',
      } as any);
    }

    const { siteId, key } = request.params;

    try {
      await service.deleteSiteContent(siteId, decodeURIComponent(key));
      return reply.code(204).send(null as any);
    } catch {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid content key',
      } as any);
    }
  });

  server.get('/s/:siteId/content/:filename', {
    schema: {
      params: publicContentParamSchema,
    },
  }, async (request, reply) => {
    const { siteId, filename } = request.params;
    const decodedFilename = decodeURIComponent(filename);

    if (decodedFilename.includes('/') || decodedFilename.includes('\\') || decodedFilename.includes('..')) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid filename',
      } as any);
    }

    const url = await service.getDownloadUrlByFilename(siteId, decodedFilename, 300);
    return reply.redirect(url);
  });
}
