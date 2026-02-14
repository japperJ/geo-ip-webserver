import { Pool } from 'pg';
import { CreateAccessLogInput, AccessLog } from '../models/AccessLog.js';

export class AccessLogService {
  constructor(private db: Pool) {}

  /**
   * Log access decision (allowed or denied)
   * Non-blocking: Uses setImmediate to log asynchronously
   */
  async log(input: CreateAccessLogInput): Promise<void> {
    // Log asynchronously to avoid blocking request
    setImmediate(async () => {
      try {
        await this.db.query(`
          INSERT INTO access_logs (
            site_id,
            timestamp,
            ip_address,
            user_agent,
            url,
            allowed,
            reason,
            ip_country,
            ip_city,
            ip_lat,
            ip_lng
          ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          input.site_id,
          input.ip_address, // Should be anonymized by caller
          input.user_agent || null,
          input.url,
          input.allowed,
          input.reason,
          input.ip_country || null,
          input.ip_city || null,
          input.ip_lat || null,
          input.ip_lng || null,
        ]);
      } catch (error) {
        // Log error but don't throw (already async, no way to handle)
        console.error('Failed to log access decision:', error);
      }
    });
  }

  /**
   * Query access logs with pagination and filters
   */
  async query(filters: {
    site_id?: string;
    allowed?: boolean;
    start_date?: Date;
    end_date?: Date;
    ip?: string;
    page?: number;
    limit?: number;
  }): Promise<{ logs: AccessLog[]; total: number; page: number; limit: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 100;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    // Build WHERE clause
    if (filters.site_id) {
      params.push(filters.site_id);
      whereClause += ` AND site_id = $${params.length}`;
    }

    if (filters.allowed !== undefined) {
      params.push(filters.allowed);
      whereClause += ` AND allowed = $${params.length}`;
    }

    if (filters.start_date) {
      params.push(filters.start_date);
      whereClause += ` AND timestamp >= $${params.length}`;
    }

    if (filters.end_date) {
      params.push(filters.end_date);
      whereClause += ` AND timestamp <= $${params.length}`;
    }

    if (filters.ip) {
      params.push(`%${filters.ip}%`);
      whereClause += ` AND ip_address::text LIKE $${params.length}`;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM access_logs ${whereClause}`;
    const countResult = await this.db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    params.push(limit, offset);
    const listQuery = `
      SELECT * FROM access_logs 
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await this.db.query(listQuery, params);
    const logs = result.rows.map(row => this.mapRow(row));

    return { logs, total, page, limit };
  }

  /**
   * Get single access log by ID
   */
  async getById(id: string): Promise<AccessLog | null> {
    const result = await this.db.query(
      'SELECT * FROM access_logs WHERE id = $1',
      [id]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Map database row to AccessLog object
   */
  private mapRow(row: any): AccessLog {
    return {
      id: row.id,
      site_id: row.site_id,
      timestamp: new Date(row.timestamp),
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      url: row.url,
      allowed: row.allowed,
      reason: row.reason,
      ip_country: row.ip_country,
      ip_city: row.ip_city,
      ip_lat: row.ip_lat ? parseFloat(row.ip_lat) : null,
      ip_lng: row.ip_lng ? parseFloat(row.ip_lng) : null,
      gps_lat: row.gps_lat ? parseFloat(row.gps_lat) : null,
      gps_lng: row.gps_lng ? parseFloat(row.gps_lng) : null,
      gps_accuracy: row.gps_accuracy ? parseFloat(row.gps_accuracy) : null,
      screenshot_url: row.screenshot_url,
    };
  }
}
