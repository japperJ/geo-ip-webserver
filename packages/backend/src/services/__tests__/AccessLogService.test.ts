import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { AccessLogService } from '../AccessLogService.js';
import { testPool } from '../../tests/setup.js';
import { SiteService } from '../SiteService.js';

describe('AccessLogService', () => {
  const accessLogService = new AccessLogService(testPool);
  const siteService = new SiteService(testPool);
  let testSiteId: string;

  beforeAll(async () => {
    // Enable sync mode for reliable testing
    accessLogService.setSyncMode(true);

    // Create test site once for all tests in this suite
    const site = await siteService.create({
      slug: 'test-site-access-logs',
      name: 'Test Site for Access Logs',
      access_mode: 'ip_only',
    });
    testSiteId = site.id;
  });

  beforeEach(async () => {
    // Only delete access_logs, not sites
    await testPool.query('DELETE FROM access_logs');
  });

  afterAll(async () => {
    // Clean up test site
    await testPool.query('DELETE FROM access_logs');
    await testPool.query('DELETE FROM sites WHERE slug = $1', ['test-site-access-logs']);
  });

  it('should log access decision', async () => {
    await accessLogService.log({
      site_id: testSiteId,
      ip_address: '192.168.1.0', // Anonymized
      user_agent: 'Mozilla/5.0',
      url: '/test',
      allowed: false,
      reason: 'ip_denylist',
      ip_country: 'US',
      ip_city: 'New York',
      ip_lat: 40.7128,
      ip_lng: -74.0060,
    });

    // Query logs (no wait needed in sync mode)
    const result = await accessLogService.query({ site_id: testSiteId });
    
    expect(result.total).toBe(1);
    expect(result.logs[0]).toMatchObject({
      site_id: testSiteId,
      ip_address: '192.168.1.0',
      url: '/test',
      allowed: false,
      reason: 'ip_denylist',
    });
  });

  it('should filter logs by allowed status', async () => {
    // Log allowed access
    await accessLogService.log({
      site_id: testSiteId,
      ip_address: '192.168.1.0',
      user_agent: null,
      url: '/test1',
      allowed: true,
      reason: 'passed',
    });

    // Log denied access
    await accessLogService.log({
      site_id: testSiteId,
      ip_address: '192.168.2.0',
      user_agent: null,
      url: '/test2',
      allowed: false,
      reason: 'ip_denylist',
    });

    // Query only denied
    const denied = await accessLogService.query({ site_id: testSiteId, allowed: false });
    expect(denied.total).toBe(1);
    expect(denied.logs[0].reason).toBe('ip_denylist');

    // Query only allowed
    const allowed = await accessLogService.query({ site_id: testSiteId, allowed: true });
    expect(allowed.total).toBe(1);
    expect(allowed.logs[0].reason).toBe('passed');
  });

  it('should paginate results', async () => {
    // Create 5 logs
    for (let i = 0; i < 5; i++) {
      await accessLogService.log({
        site_id: testSiteId,
        ip_address: `192.168.1.${i}`,
        user_agent: null,
        url: `/test${i}`,
        allowed: true,
        reason: 'passed',
      });
    }

    // Get page 1 (limit 2)
    const page1 = await accessLogService.query({ site_id: testSiteId, page: 1, limit: 2 });
    expect(page1.total).toBe(5);
    expect(page1.logs.length).toBe(2);
    expect(page1.page).toBe(1);

    // Get page 2 (limit 2)
    const page2 = await accessLogService.query({ site_id: testSiteId, page: 2, limit: 2 });
    expect(page2.total).toBe(5);
    expect(page2.logs.length).toBe(2);
    expect(page2.page).toBe(2);
  });

  it('should filter by IP prefix', async () => {
    await accessLogService.log({
      site_id: testSiteId,
      ip_address: '192.168.1.0',
      user_agent: null,
      url: '/test1',
      allowed: true,
      reason: 'passed',
    });

    await accessLogService.log({
      site_id: testSiteId,
      ip_address: '10.0.0.0',
      user_agent: null,
      url: '/test2',
      allowed: true,
      reason: 'passed',
    });

    const result = await accessLogService.query({ site_id: testSiteId, ip: '192.168' });
    expect(result.total).toBe(1);
    expect(result.logs[0].ip_address).toBe('192.168.1.0');
  });

  it('should get single log by ID', async () => {
    await accessLogService.log({
      site_id: testSiteId,
      ip_address: '192.168.1.0',
      user_agent: 'Mozilla/5.0',
      url: '/test',
      allowed: true,
      reason: 'passed',
    });

    const result = await accessLogService.query({ site_id: testSiteId });
    const logId = result.logs[0].id;

    const log = await accessLogService.getById(logId);
    expect(log).toBeTruthy();
    expect(log?.id).toBe(logId);
    expect(log?.url).toBe('/test');
  });

  it('should return null for non-existent log', async () => {
    const log = await accessLogService.getById('00000000-0000-0000-0000-000000000001');
    expect(log).toBeNull();
  });
});
