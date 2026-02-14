import { test, expect } from '@playwright/test';

test.describe('Site Management', () => {
  test('should navigate to sites page', async ({ page }) => {
    await page.goto('/');
    
    // Should redirect to /sites
    await expect(page).toHaveURL('/sites');
    
    // Should show sites page title
    await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
  });

  test('should navigate to create site page', async ({ page }) => {
    await page.goto('/sites');
    
    // Click create site button
    await page.getByRole('button', { name: /create site/i }).first().click();
    
    // Should navigate to create page
    await expect(page).toHaveURL('/sites/new');
    await expect(page.getByRole('heading', { name: 'Create Site' })).toBeVisible();
  });

  test('should show validation errors on empty form submit', async ({ page }) => {
    await page.goto('/sites/new');
    
    // Try to submit empty form
    await page.getByRole('button', { name: /create site/i }).click();
    
    // Should show validation errors
    await expect(page.getByText('Slug is required')).toBeVisible();
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Hostname is required')).toBeVisible();
  });

  test('should create a new site successfully', async ({ page }) => {
    await page.goto('/sites/new');
    
    // Fill in the form
    await page.getByLabel('Slug *').fill('test-site');
    await page.getByLabel('Name *').fill('Test Site');
    await page.getByLabel('Hostname *').fill('test.example.com');
    
    // Select access mode
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'IP Only' }).click();
    
    // Add IP allowlist
    await page.getByLabel('IP Allowlist').fill('192.168.1.0/24\n10.0.0.1');
    
    // Submit form
    await page.getByRole('button', { name: /create site/i }).click();
    
    // Should redirect to sites list
    await expect(page).toHaveURL('/sites', { timeout: 10000 });
    
    // Should show the new site in the list
    await expect(page.getByText('Test Site')).toBeVisible();
  });

  test('should show IP validation errors', async ({ page }) => {
    await page.goto('/sites/new');
    
    // Fill in basic fields
    await page.getByLabel('Slug *').fill('test-site-2');
    await page.getByLabel('Name *').fill('Test Site 2');
    await page.getByLabel('Hostname *').fill('test2.example.com');
    
    // Add invalid IP
    await page.getByLabel('IP Allowlist').fill('invalid-ip\n256.256.256.256');
    
    // Should show validation errors
    await expect(page.getByText(/Invalid IP addresses/i)).toBeVisible();
    await expect(page.getByText(/invalid-ip/i)).toBeVisible();
  });
});

test.describe('Access Logs', () => {
  test('should navigate to access logs page', async ({ page }) => {
    await page.goto('/');
    
    // Click access logs link in sidebar
    await page.getByRole('link', { name: /access logs/i }).click();
    
    // Should navigate to logs page
    await expect(page).toHaveURL('/logs');
    await expect(page.getByRole('heading', { name: 'Access Logs' })).toBeVisible();
  });

  test('should display filters', async ({ page }) => {
    await page.goto('/logs');
    
    // Should show filter controls
    await expect(page.getByText('Filters')).toBeVisible();
    await expect(page.getByLabel('Site')).toBeVisible();
    await expect(page.getByLabel('Status')).toBeVisible();
    await expect(page.getByLabel('IP Address')).toBeVisible();
  });

  test('should filter by status', async ({ page }) => {
    await page.goto('/logs');
    
    // Wait for logs to load
    await page.waitForTimeout(1000);
    
    // Open status filter
    const statusFilter = page.getByLabel('Status');
    await statusFilter.click();
    
    // Select "Blocked"
    await page.getByRole('option', { name: 'Blocked' }).click();
    
    // URL should update with filter
    await expect(page).toHaveURL(/allowed=false/);
  });
});

test.describe('Navigation', () => {
  test('should navigate between pages using sidebar', async ({ page }) => {
    await page.goto('/');
    
    // Start on sites page
    await expect(page).toHaveURL('/sites');
    
    // Navigate to logs
    await page.getByRole('link', { name: /access logs/i }).click();
    await expect(page).toHaveURL('/logs');
    
    // Navigate back to sites
    await page.getByRole('link', { name: /sites/i }).first().click();
    await expect(page).toHaveURL('/sites');
  });

  test('should highlight active navigation item', async ({ page }) => {
    await page.goto('/sites');
    
    // Sites link should be active
    const sitesLink = page.getByRole('link', { name: /sites/i }).first();
    await expect(sitesLink).toHaveClass(/bg-blue-600/);
    
    // Navigate to logs
    await page.getByRole('link', { name: /access logs/i }).click();
    
    // Access Logs link should now be active
    const logsLink = page.getByRole('link', { name: /access logs/i });
    await expect(logsLink).toHaveClass(/bg-blue-600/);
  });
});
