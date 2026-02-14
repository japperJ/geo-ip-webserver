import type { FastifyInstance } from 'fastify';
import { createGDPRService } from '../services/GDPRService.js';
import { s3Service } from '../services/S3Service.js';
import { Readable } from 'stream';

export async function gdprRoutes(fastify: FastifyInstance) {
  const gdprService = createGDPRService(fastify);

  // Record consent
  fastify.post('/api/gdpr/consent', async (request, reply) => {
    const { consentType, granted, sessionId } = request.body as {
      consentType: 'gps' | 'cookies' | 'analytics';
      granted: boolean;
      sessionId: string;
    };

    const userId = (request.user as any)?.id;
    const ipAddress = request.ip;

    await gdprService.recordConsent({
      userId,
      sessionId,
      consentType,
      granted,
      timestamp: new Date(),
      ipAddress
    });

    return { success: true };
  });

  // Check consent status
  fastify.get('/api/gdpr/consent/:sessionId/:type', async (request, reply) => {
    const { sessionId, type } = request.params as { sessionId: string; type: string };
    
    const hasConsent = await gdprService.hasConsent(
      sessionId, 
      type as 'gps' | 'cookies' | 'analytics'
    );

    return { hasConsent };
  });

  // Export user data (GDPR Article 15 - Right to Access)
  fastify.get('/api/user/data-export', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = (request.user as any).id;

    const data = await gdprService.exportUserData(userId);

    // Create JSON export
    const jsonData = JSON.stringify(data, null, 2);

    reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="user-data-${userId}-${Date.now()}.json"`)
      .send(jsonData);
  });

  // Delete user account and data (GDPR Article 17 - Right to Erasure)
  fastify.delete('/api/user/data', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = (request.user as any).id;

    await gdprService.deleteUserData(userId);

    return {
      success: true,
      message: 'All user data has been deleted or anonymized'
    };
  });

  // Get artifact pre-signed URL
  fastify.get('/api/artifacts/:key(*)', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { key } = request.params as { key: string };

    // Extract siteId from key (format: screenshots/blocked/{siteId}/...)
    const siteIdMatch = key.match(/screenshots\/blocked\/([^/]+)\//);
    if (!siteIdMatch) {
      return reply.code(400).send({ error: 'Invalid artifact key' });
    }

    const siteId = siteIdMatch[1];

    // Verify user has access to this site
    const userId = (request.user as any).id;
    const userRole = (request.user as any).globalRole;

    if (userRole !== 'super_admin') {
      const accessCheck = await fastify.pg.query(
        'SELECT 1 FROM user_site_roles WHERE user_id = $1 AND site_id = $2',
        [userId, siteId]
      );

      if (accessCheck.rows.length === 0) {
        return reply.code(403).send({ error: 'Access denied' });
      }
    }

    // Generate pre-signed URL (1 hour expiry)
    const presignedUrl = await s3Service.getPresignedUrl(key, 3600);

    return { url: presignedUrl };
  });

  // Privacy policy endpoint
  fastify.get('/api/privacy-policy', async (request, reply) => {
    return {
      lastUpdated: '2026-02-14',
      sections: [
        {
          title: 'Data Collection',
          content: 'We collect IP addresses, GPS coordinates, and user agent information for access control and audit purposes.'
        },
        {
          title: 'Data Retention',
          content: 'Access logs are retained for 90 days, after which they are automatically deleted.'
        },
        {
          title: 'Your Rights',
          content: 'You have the right to access, export, and delete your personal data at any time.'
        },
        {
          title: 'Third-Party Processors',
          content: 'We use MaxMind for IP geolocation and AWS S3 for artifact storage.'
        }
      ]
    };
  });
}
