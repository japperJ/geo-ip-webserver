import { test, expect } from '@playwright/test';

test.describe('Site Management', () => {
  test('should navigate to sites page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should redirect to /sites
    await expect(page).toHaveURL('/sites');
    
    // Should show sites page title (h1 level heading)
    await expect(page.locator('h1').filter({ hasText: 'Sites' })).toBeVisible();
  });

  test('should navigate to create site page', async ({ page }) => {
    await page.goto('/sites');
    await page.waitForLoadState('networkidle');
    
    // Click create site button
    await page.getByRole('button', { name: /create site/i }).first().click();
    
    // Should navigate to create page
    await expect(page).toHaveURL('/sites/new');
    await expect(page.locator('h1').filter({ hasText: 'Create Site' })).toBeVisible();
  });

  test('should show validation errors on empty form submit', async ({ page }) => {
    await page.goto('/sites/new');
    await page.waitForLoadState('networkidle');
    
    // Try to submit empty form
    await page.getByRole('button', { name: /create site/i }).click();
    
    // Should show validation errors (using first() to handle duplicates)
    await expect(page.getByText('Slug is required').first()).toBeVisible();
    await expect(page.getByText('Name is required').first()).toBeVisible();
    await expect(page.getByText('Hostname is required').first()).toBeVisible();
  });

  test.skip('should create a new site successfully', async ({ page }) => {
    await page.goto('/sites/new');
    
    // Fill in the form using input IDs
    await page.locator('#slug').fill(`test-site-${Date.now()}`);
    await page.locator('#name').fill('Test Site');
    await page.locator('#hostname').fill('test.example.com');
    
    // Select access mode
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'IP Only' }).click();
    
    // Add IP allowlist
    await page.locator('#ip_allowlist').fill('192.168.1.0/24\n10.0.0.1');
    
    // Submit form
    await page.getByRole('button', { name: /create site/i }).click();
    
    // Should redirect to sites list
    await expect(page).toHaveURL('/sites', { timeout: 10000 });
    
    // Should show the new site in the list
    await expect(page.getByText('Test Site')).toBeVisible();
  });

  test('should show IP validation errors', async ({ page }) => {
    await page.goto('/sites/new');
    await page.waitForLoadState('networkidle');
    
    // Fill in basic fields using IDs
    await page.locator('#slug').fill(`test-site-err-${Date.now()}`);
    await page.locator('#name').fill('Test Site 2');
    await page.locator('#hostname').fill('test2.example.com');
    
    // Add invalid IP
    await page.locator('#ip_allowlist').fill('invalid-ip\n256.256.256.256');
    
    // Click away to trigger validation
    await page.locator('#name').click();
    
    // Should show validation errors
    await expect(page.getByText(/Invalid IP addresses/i)).toBeVisible();
    await expect(page.getByText(/invalid-ip/i)).toBeVisible();
  });
});

test.describe('Access Logs', () => {
  test('should navigate to access logs page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Click access logs link in sidebar
    await page.getByRole('link', { name: /access logs/i }).click();
    
    // Should navigate to logs page
    await expect(page).toHaveURL('/logs');
    await expect(page.locator('h1').filter({ hasText: 'Access Logs' })).toBeVisible();
  });

  test('should display filters', async ({ page }) => {
    await page.goto('/logs');
    await page.waitForLoadState('networkidle');
    
    // Should show filter controls (card title includes icon, so we match text)
    await expect(page.getByText('Filters').filter({ has: page.locator('svg') })).toBeVisible();
    await expect(page.getByText('Site').first()).toBeVisible();
    await expect(page.getByText('Status').first()).toBeVisible();
    await expect(page.getByText('IP Address')).toBeVisible();
  });

  test('should filter by status', async ({ page }) => {
    await page.goto('/logs');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Click on Status combobox (using the label to find the nearby Select)
    const statusFilter = page.locator('label:has-text("Status")').locator('..').getByRole('combobox');
    await statusFilter.click();
    
    // Select "Blocked"
    await page.getByRole('option', { name: 'Blocked' }).click();
    
    // Wait for filter to be applied and verify the combobox shows "Blocked"
    await page.waitForTimeout(500);
    await expect(statusFilter).toContainText('Blocked');
  });
});

test.describe('Navigation', () => {
  test('should navigate between pages using sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Start on sites page
    await expect(page).toHaveURL('/sites');
    
    // Navigate to logs
    await page.getByRole('link', { name: /access logs/i }).click();
    await expect(page).toHaveURL('/logs');
    
    // Navigate back to sites (using more specific selector)
    const sitesLinks = page.getByRole('link', { name: /sites/i });
    await sitesLinks.first().click();
    await expect(page).toHaveURL('/sites');
  });

  test('should highlight active navigation item', async ({ page }) => {
    await page.goto('/sites');
    await page.waitForLoadState('networkidle');
    
    // Sites link should be active (check if any Sites link has the active class)
    const sitesLink = page.getByRole('link', { name: /^sites$/i }).first();
    await expect(sitesLink).toHaveClass(/bg-blue-600/);
    
    // Navigate to logs
    await page.getByRole('link', { name: /access logs/i }).click();
    
    // Access Logs link should now be active
    const logsLink = page.getByRole('link', { name: /access logs/i });
    await expect(logsLink).toHaveClass(/bg-blue-600/);
  });
});
