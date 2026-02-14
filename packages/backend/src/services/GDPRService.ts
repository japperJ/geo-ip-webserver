import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

export interface ConsentRecord {
  userId?: string;
  sessionId: string;
  consentType: 'gps' | 'cookies' | 'analytics';
  granted: boolean;
  timestamp: Date;
  ipAddress: string;
}

export interface DataExportResult {
  user?: {
    id: string;
    email: string;
    createdAt: Date;
  };
  accessLogs: any[];
  consents: ConsentRecord[];
  sites: any[];
}

export class GDPRService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  // Record user consent
  async recordConsent(consent: ConsentRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO gdpr_consents (user_id, session_id, consent_type, granted, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [consent.userId || null, consent.sessionId, consent.consentType, consent.granted, consent.ipAddress]
    );
  }

  // Export all user data (Right to Access - GDPR Article 15)
  async exportUserData(userId: string): Promise<DataExportResult> {
    const result: DataExportResult = {
      accessLogs: [],
      consents: [],
      sites: []
    };

    // User profile
    const userRes = await this.db.query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows[0]) {
      result.user = userRes.rows[0];
    }

    // Access logs (last 90 days)
    const logsRes = await this.db.query(
      `SELECT * FROM access_logs 
       WHERE timestamp >= NOW() - INTERVAL '90 days'
       ORDER BY timestamp DESC`,
      []
    );
    result.accessLogs = logsRes.rows;

    // Consents
    const consentsRes = await this.db.query(
      'SELECT * FROM gdpr_consents WHERE user_id = $1 ORDER BY timestamp DESC',
      [userId]
    );
    result.consents = consentsRes.rows;

    // Sites with roles
    const sitesRes = await this.db.query(
      `SELECT s.*, usr.role 
       FROM sites s
       JOIN user_site_roles usr ON s.id = usr.site_id
       WHERE usr.user_id = $1`,
      [userId]
    );
    result.sites = sitesRes.rows;

    return result;
  }

  // Delete all user data (Right to Erasure - GDPR Article 17)
  async deleteUserData(userId: string): Promise<void> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Delete user roles
      await client.query('DELETE FROM user_site_roles WHERE user_id = $1', [userId]);

      // Delete refresh tokens
      await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

      // Delete consents
      await client.query('DELETE FROM gdpr_consents WHERE user_id = $1', [userId]);

      // Anonymize access logs instead of deleting (for audit trail)
      await client.query(
        `UPDATE access_logs 
         SET ip_address = '0.0.0.0'::inet,
             gps_lat = NULL,
             gps_lng = NULL,
             user_agent = 'DELETED',
             screenshot_url = NULL
         WHERE timestamp >= NOW() - INTERVAL '90 days'`,
        []
      );

      // Delete user account
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Check if consent exists
  async hasConsent(sessionId: string, consentType: 'gps' | 'cookies' | 'analytics'): Promise<boolean> {
    const result = await this.db.query(
      `SELECT granted FROM gdpr_consents 
       WHERE session_id = $1 AND consent_type = $2 
       ORDER BY timestamp DESC LIMIT 1`,
      [sessionId, consentType]
    );

    return result.rows.length > 0 && result.rows[0].granted;
  }
}

export function createGDPRService(fastify: FastifyInstance): GDPRService {
  return new GDPRService(fastify.pg as Pool);
}
