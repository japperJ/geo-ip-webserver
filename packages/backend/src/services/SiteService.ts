import { Pool } from 'pg';
import { Site, CreateSiteInput, UpdateSiteInput, ListSitesQuery } from '../models/Site.js';

export class SiteService {
  constructor(private db: Pool) {}

  /**
   * Create a new site
   * @throws Error if slug or hostname already exists
   */
  async create(input: CreateSiteInput): Promise<Site> {
    const query = `
      INSERT INTO sites (
        slug,
        hostname,
        name,
        access_mode,
        ip_allowlist,
        ip_denylist,
        country_allowlist,
        country_denylist,
        block_vpn_proxy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      input.slug,
      input.hostname || null,
      input.name,
      input.access_mode || 'disabled',
      input.ip_allowlist || null,
      input.ip_denylist || null,
      input.country_allowlist || null,
      input.country_denylist || null,
      input.block_vpn_proxy ?? false,
    ];

    const result = await this.db.query(query, values);
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get site by ID
   */
  async getById(id: string): Promise<Site | null> {
    const query = 'SELECT * FROM sites WHERE id = $1 AND deleted_at IS NULL';
    const result = await this.db.query(query, [id]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get site by hostname
   */
  async getByHostname(hostname: string): Promise<Site | null> {
    const query = 'SELECT * FROM sites WHERE hostname = $1 AND deleted_at IS NULL';
    const result = await this.db.query(query, [hostname]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * List sites with pagination and filtering
   */
  async list(query: ListSitesQuery): Promise<{ sites: Site[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (query.access_mode) {
      params.push(query.access_mode);
      whereClause += ` AND access_mode = $${params.length}`;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM sites ${whereClause}`;
    const countResult = await this.db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    params.push(limit, offset);
    const listQuery = `
      SELECT * FROM sites 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await this.db.query(listQuery, params);
    const sites = result.rows.map(row => this.mapRow(row));

    return { sites, total, page, limit };
  }

  /**
   * Update site by ID
   */
  async update(id: string, input: UpdateSiteInput): Promise<Site | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic UPDATE query
    if (input.hostname !== undefined) {
      fields.push(`hostname = $${paramIndex++}`);
      values.push(input.hostname);
    }
    if (input.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.access_mode !== undefined) {
      fields.push(`access_mode = $${paramIndex++}`);
      values.push(input.access_mode);
    }
    if (input.ip_allowlist !== undefined) {
      fields.push(`ip_allowlist = $${paramIndex++}`);
      values.push(input.ip_allowlist);
    }
    if (input.ip_denylist !== undefined) {
      fields.push(`ip_denylist = $${paramIndex++}`);
      values.push(input.ip_denylist);
    }
    if (input.country_allowlist !== undefined) {
      fields.push(`country_allowlist = $${paramIndex++}`);
      values.push(input.country_allowlist);
    }
    if (input.country_denylist !== undefined) {
      fields.push(`country_denylist = $${paramIndex++}`);
      values.push(input.country_denylist);
    }
    if (input.block_vpn_proxy !== undefined) {
      fields.push(`block_vpn_proxy = $${paramIndex++}`);
      values.push(input.block_vpn_proxy);
    }
    if (input.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(input.enabled);
    }

    if (fields.length === 0) {
      return this.getById(id); // No changes
    }

    // Add updated_at
    fields.push(`updated_at = NOW()`);

    // Add ID parameter
    values.push(id);

    const query = `
      UPDATE sites 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Soft delete site
   */
  async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE sites 
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;

    const result = await this.db.query(query, [id]);
    return result.rowCount! > 0;
  }

  /**
   * Map database row to Site object
   */
  private mapRow(row: any): Site {
    return {
      id: row.id,
      slug: row.slug,
      hostname: row.hostname,
      name: row.name,
      access_mode: row.access_mode,
      ip_allowlist: row.ip_allowlist,
      ip_denylist: row.ip_denylist,
      country_allowlist: row.country_allowlist,
      country_denylist: row.country_denylist,
      block_vpn_proxy: row.block_vpn_proxy,
      enabled: row.enabled,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
