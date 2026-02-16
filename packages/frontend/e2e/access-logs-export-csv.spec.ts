import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('Access Logs CSV export', () => {
  test('downloads CSV and sends active filters without navigating away', async ({ page }) => {
    const siteId = 'site-export-e2e';
    const ipFilter = '203.0.113';
    const csvBody = [
      'timestamp,ip_address,url,allowed,reason',
      '2026-02-16T12:00:00.000Z,203.0.113.0,/blocked,false,ip_denylist',
    ].join('\n');

    let exportRequestUrl: URL | null = null;

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'test-token',
          user: {
            id: 'user-e2e',
            email: 'admin@test.local',
            role: 'super_admin',
          },
        }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'user-e2e',
            email: 'admin@test.local',
            role: 'super_admin',
          },
        }),
      });
    });

    await page.route('**/api/sites*', async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname !== '/api/sites') {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sites: [
            {
              id: siteId,
              name: 'Export Test Site',
            },
          ],
          pagination: {
            page: 1,
            limit: 100,
            total: 1,
            totalPages: 1,
          },
        }),
      });
    });

    await page.route('**/api/access-logs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          logs: [],
          pagination: {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 1,
          },
        }),
      });
    });

    await page.route(`**/api/sites/${siteId}/access-logs/export*`, async (route) => {
      exportRequestUrl = new URL(route.request().url());

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="access-logs-test.csv"',
        },
        body: csvBody,
      });
    });

    await page.goto('/logs');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1').filter({ hasText: 'Access Logs' })).toBeVisible();

    const siteFilter = page.getByRole('combobox').nth(0);
    await siteFilter.click();
    await page.getByRole('option', { name: 'Export Test Site' }).click();

    const statusFilter = page.getByRole('combobox').nth(1);
    await statusFilter.click();
    await page.getByRole('option', { name: 'Blocked' }).click();
    await expect(statusFilter).toContainText('Blocked');

    await page.locator('#ip_filter').fill(ipFilter);

    const logsUrlBeforeExport = page.url();
    const downloadPromise = page.waitForEvent('download');

    await page.getByRole('button', { name: /export csv/i }).click();
    const download = await downloadPromise;

    await expect(page).toHaveURL(logsUrlBeforeExport);

    expect(exportRequestUrl).not.toBeNull();
    expect(exportRequestUrl?.searchParams.get('allowed')).toBe('false');
    expect(exportRequestUrl?.searchParams.get('ip')).toBe(ipFilter);

    expect(download.suggestedFilename()).toBe('access-logs-test.csv');

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const downloadedCsv = await readFile(downloadPath!, 'utf8');
    expect(downloadedCsv).toBe(csvBody);
  });
});