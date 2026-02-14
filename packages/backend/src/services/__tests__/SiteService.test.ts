import { describe, it, expect, beforeEach } from 'vitest';
import { SiteService } from '../SiteService.js';
import { testPool } from '../../tests/setup.js';

describe('SiteService', () => {
  const siteService = new SiteService(testPool);

  // Clean up before each test
  beforeEach(async () => {
    await testPool.query('DELETE FROM sites');
  });

  describe('create', () => {
    it('should create a site with required fields', async () => {
      const input = {
        slug: 'test-site',
        name: 'Test Site',
      };

      const site = await siteService.create(input);

      expect(site).toMatchObject({
        slug: 'test-site',
        name: 'Test Site',
        access_mode: 'disabled', // Default
        block_vpn_proxy: false, // Default
        enabled: true, // Default
      });
      expect(site.id).toBeTruthy();
      expect(site.created_at).toBeInstanceOf(Date);
    });

    it('should create a site with all optional fields', async () => {
      const input = {
        slug: 'full-site',
        name: 'Full Site',
        hostname: 'example.com',
        access_mode: 'ip_only' as const,
        ip_allowlist: ['192.168.1.0/24', '10.0.0.1'],
        ip_denylist: ['203.0.113.0/24'],
        country_allowlist: ['US', 'CA'],
        country_denylist: ['CN'],
        block_vpn_proxy: true,
      };

      const site = await siteService.create(input);

      expect(site).toMatchObject(input);
    });

    it('should throw error on duplicate slug', async () => {
      const input = {
        slug: 'duplicate',
        name: 'Site 1',
      };

      await siteService.create(input);

      await expect(
        siteService.create(input)
      ).rejects.toThrow();
    });

    it('should throw error on duplicate hostname', async () => {
      await siteService.create({
        slug: 'site1',
        name: 'Site 1',
        hostname: 'example.com',
      });

      await expect(
        siteService.create({
          slug: 'site2',
          name: 'Site 2',
          hostname: 'example.com',
        })
      ).rejects.toThrow();
    });
  });

  describe('getById', () => {
    it('should return site by ID', async () => {
      const created = await siteService.create({
        slug: 'test',
        name: 'Test',
      });

      const site = await siteService.getById(created.id);

      expect(site).toMatchObject({
        id: created.id,
        slug: 'test',
        name: 'Test',
      });
    });

    it('should return null for non-existent ID', async () => {
      const site = await siteService.getById('00000000-0000-0000-0000-000000000000');
      expect(site).toBeNull();
    });

    it('should not return deleted sites', async () => {
      const created = await siteService.create({
        slug: 'deleted',
        name: 'Deleted',
      });

      await siteService.delete(created.id);

      const site = await siteService.getById(created.id);
      expect(site).toBeNull();
    });
  });

  describe('getByHostname', () => {
    it('should return site by hostname', async () => {
      await siteService.create({
        slug: 'test',
        name: 'Test',
        hostname: 'example.com',
      });

      const site = await siteService.getByHostname('example.com');

      expect(site).toMatchObject({
        hostname: 'example.com',
      });
    });

    it('should return null for non-existent hostname', async () => {
      const site = await siteService.getByHostname('nonexistent.com');
      expect(site).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // Create test sites
      await siteService.create({ slug: 'site1', name: 'Site 1', access_mode: 'ip_only' });
      await siteService.create({ slug: 'site2', name: 'Site 2', access_mode: 'geo_only' });
      await siteService.create({ slug: 'site3', name: 'Site 3', access_mode: 'ip_only' });
    });

    it('should list all sites with default pagination', async () => {
      const result = await siteService.list({});

      expect(result.sites).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should paginate results', async () => {
      const result = await siteService.list({ page: 1, limit: 2 });

      expect(result.sites).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('should filter by access_mode', async () => {
      const result = await siteService.list({ access_mode: 'ip_only' });

      expect(result.sites).toHaveLength(2);
      expect(result.sites.every(s => s.access_mode === 'ip_only')).toBe(true);
    });

    it('should not include deleted sites', async () => {
      const site = await siteService.create({ slug: 'to-delete', name: 'To Delete' });
      await siteService.delete(site.id);

      const result = await siteService.list({});

      expect(result.total).toBe(3); // Excluding deleted
      expect(result.sites.find(s => s.id === site.id)).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update site fields', async () => {
      const created = await siteService.create({
        slug: 'test',
        name: 'Original Name',
      });

      const updated = await siteService.update(created.id, {
        name: 'Updated Name',
        access_mode: 'ip_only',
      });

      expect(updated).toMatchObject({
        id: created.id,
        slug: 'test', // Unchanged
        name: 'Updated Name',
        access_mode: 'ip_only',
      });
    });

    it('should update IP lists', async () => {
      const created = await siteService.create({
        slug: 'test',
        name: 'Test',
      });

      const updated = await siteService.update(created.id, {
        ip_allowlist: ['192.168.1.0/24'],
        ip_denylist: ['10.0.0.1'],
      });

      expect(updated?.ip_allowlist).toEqual(['192.168.1.0/24']);
      expect(updated?.ip_denylist).toEqual(['10.0.0.1']);
    });

    it('should return null for non-existent site', async () => {
      const updated = await siteService.update('00000000-0000-0000-0000-000000000000', {
        name: 'Test',
      });

      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should soft delete site', async () => {
      const created = await siteService.create({
        slug: 'test',
        name: 'Test',
      });

      const deleted = await siteService.delete(created.id);

      expect(deleted).toBe(true);

      // Verify site is not returned
      const site = await siteService.getById(created.id);
      expect(site).toBeNull();

      // Verify site still exists in DB with deleted_at set
      const result = await testPool.query(
        'SELECT deleted_at FROM sites WHERE id = $1',
        [created.id]
      );
      expect(result.rows[0].deleted_at).toBeTruthy();
    });

    it('should return false for non-existent site', async () => {
      const deleted = await siteService.delete('00000000-0000-0000-0000-000000000000');
      expect(deleted).toBe(false);
    });
  });
});
