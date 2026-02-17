import { test, expect } from '@playwright/test';

test.describe('Operational smoke', () => {
  test('docs endpoints are reachable via proxy entrypoint', async ({ request }) => {
    const docsResponse = await request.get('/documentation');
    expect(docsResponse.status()).toBe(200);

    const openApiResponse = await request.get('/documentation/json');
    expect(openApiResponse.status()).toBe(200);

    const openApi = await openApiResponse.json();
    expect(typeof openApi.openapi).toBe('string');
  });

  test('authenticated admin UI session is usable', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('admin@test.local');
    await page.getByLabel('Password').fill('Test123!@#');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/sites$/);
    await expect(page.locator('h1').filter({ hasText: 'Sites' })).toBeVisible();
  });
});
