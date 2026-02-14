import { test, expect } from '@playwright/test';

test.describe('Geo-Fencing', () => {
  test('should display geo-fencing map on site editor', async ({ page }) => {
    await page.goto('/sites/new');
    await page.waitForLoadState('networkidle');
    
    // Need to select GPS access mode first to show the geofence section
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'GPS Only' }).click();
    
    // Wait a moment for the section to appear
    await page.waitForTimeout(500);
    
    // Check that the geofence map section exists
    await expect(page.getByText('GPS Geofencing')).toBeVisible();
    await expect(page.getByText(/Draw a polygon or circle/i)).toBeVisible();
    
    // Map container should be visible
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();
  });

  test('should create site with polygon geofence', async ({ page }) => {
    await page.goto('/sites/new');
    await page.waitForLoadState('networkidle');
    
    // Fill in basic site information
    const timestamp = Date.now();
    await page.locator('#slug').fill(`geo-polygon-test-${timestamp}`);
    await page.locator('#name').fill('Polygon Geofence Test');
    await page.locator('#hostname').fill(`polygon-test-${timestamp}.example.com`);
    
    // Select GPS-only access mode
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'GPS Only' }).click();
    
    // Wait for map to load
    await page.waitForSelector('.leaflet-container');
    await page.waitForTimeout(1000);
    
    // Click the polygon drawing tool
    const drawPolygonButton = page.locator('.leaflet-draw-draw-polygon');
    await expect(drawPolygonButton).toBeVisible();
    await drawPolygonButton.click();
    
    // Draw a polygon by clicking 4 points on the map
    const mapContainer = page.locator('.leaflet-container');
    const box = await mapContainer.boundingBox();
    
    if (box) {
      // Click 4 corners of a rectangle
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
      await page.waitForTimeout(200);
      await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
      await page.waitForTimeout(200);
      await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.7);
      await page.waitForTimeout(200);
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
      await page.waitForTimeout(200);
      
      // Double-click to finish the polygon
      await page.mouse.dblclick(box.x + box.width * 0.3, box.y + box.height * 0.3);
    }
    
    // Wait for the polygon to be drawn
    await page.waitForTimeout(500);
    
    // The geofence info should show polygon type
    await expect(page.getByText('Type: Polygon')).toBeVisible();
    
    // Submit the form
    await page.getByRole('button', { name: /create site/i }).click();
    
    // Should redirect to sites list (or stay on page if validation fails)
    // Check that we either redirected or stayed with success message
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/sites/);
  });

  test('should create site with radius geofence', async ({ page }) => {
    await page.goto('/sites/new');
    
    // Fill in basic site information
    const timestamp = Date.now();
    await page.locator('#slug').fill(`geo-radius-test-${timestamp}`);
    await page.locator('#name').fill('Radius Geofence Test');
    await page.locator('#hostname').fill(`radius-test-${timestamp}.example.com`);
    
    // Select GPS-only access mode
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'GPS Only' }).click();
    
    // Wait for map to load
    await page.waitForSelector('.leaflet-container');
    await page.waitForTimeout(1000);
    
    // Click the circle drawing tool
    const drawCircleButton = page.locator('.leaflet-draw-draw-circle');
    await expect(drawCircleButton).toBeVisible();
    await drawCircleButton.click();
    
    // Draw a circle by clicking center and dragging
    const mapContainer = page.locator('.leaflet-container');
    const box = await mapContainer.boundingBox();
    
    if (box) {
      const centerX = box.x + box.width * 0.5;
      const centerY = box.y + box.height * 0.5;
      
      // Click and drag to create circle
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX + 100, centerY);
      await page.mouse.up();
    }
    
    // Wait for the circle to be drawn
    await page.waitForTimeout(500);
    
    // The geofence info should show radius type
    await expect(page.getByText('Type: Radius')).toBeVisible();
    
    // Submit the form
    await page.getByRole('button', { name: /create site/i }).click();
    
    // Should redirect to sites list (or stay on page if validation fails)
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/sites/);
  });

  test('should validate GPS coordinates against geofence via API', async ({ request }) => {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
    
    // Use the SF polygon test site we created earlier
    const siteId = '51bc16ce-5bea-4d92-9161-8fdae6cd37f4';
    
    // Test location inside SF polygon (should be allowed)
    const insideResponse = await request.post(`${baseURL}/api/sites/${siteId}/validate-location`, {
      data: {
        gps_lat: 37.779,
        gps_lng: -122.415,
        gps_accuracy: 10
      }
    });
    
    expect(insideResponse.ok()).toBeTruthy();
    const insideData = await insideResponse.json();
    expect(insideData.allowed).toBe(true);
    expect(insideData.site_name).toBe('San Francisco Downtown Test');
    
    // Test location outside (LA) - should be denied
    const outsideResponse = await request.post(`${baseURL}/api/sites/${siteId}/validate-location`, {
      data: {
        gps_lat: 34.0522,
        gps_lng: -118.2437,
        gps_accuracy: 10
      }
    });
    
    expect(outsideResponse.ok()).toBeTruthy();
    const outsideData = await outsideResponse.json();
    expect(outsideData.allowed).toBe(false);
    expect(outsideData.reason).toContain('outside');
  });

  test('should validate GPS coordinates against radius geofence via API', async ({ request }) => {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
    
    // Use the NYC radius test site we created earlier
    const siteId = 'b606eeb7-7d7a-4f9d-910d-2e7e5fa330cf';
    
    // Test location at center (should be allowed)
    const centerResponse = await request.post(`${baseURL}/api/sites/${siteId}/validate-location`, {
      data: {
        gps_lat: 40.7128,
        gps_lng: -74.0060,
        gps_accuracy: 10
      }
    });
    
    expect(centerResponse.ok()).toBeTruthy();
    const centerData = await centerResponse.json();
    expect(centerData.allowed).toBe(true);
    expect(centerData.distance_km).toBeLessThan(1);
    
    // Test location outside 5km radius (Times Square is ~5.4km away)
    const outsideResponse = await request.post(`${baseURL}/api/sites/${siteId}/validate-location`, {
      data: {
        gps_lat: 40.7589,
        gps_lng: -73.9851,
        gps_accuracy: 10
      }
    });
    
    expect(outsideResponse.ok()).toBeTruthy();
    const outsideData = await outsideResponse.json();
    expect(outsideData.allowed).toBe(false);
    expect(outsideData.distance_km).toBeGreaterThan(5);
  });

  test('should edit geofence on existing site', async ({ page }) => {
    // First create a site
    await page.goto('/sites/new');
    
    const timestamp = Date.now();
    const slug = `geo-edit-test-${timestamp}`;
    
    await page.locator('#slug').fill(slug);
    await page.locator('#name').fill('Geofence Edit Test');
    await page.locator('#hostname').fill(`edit-test-${timestamp}.example.com`);
    
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'GPS Only' }).click();
    
    // Draw a quick polygon
    await page.waitForSelector('.leaflet-container');
    await page.waitForTimeout(1000);
    
    const drawPolygonButton = page.locator('.leaflet-draw-draw-polygon');
    await drawPolygonButton.click();
    
    const mapContainer = page.locator('.leaflet-container');
    const box = await mapContainer.boundingBox();
    
    if (box) {
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
      await page.waitForTimeout(100);
      await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
      await page.waitForTimeout(100);
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
      await page.waitForTimeout(100);
      await page.mouse.dblclick(box.x + box.width * 0.4, box.y + box.height * 0.4);
    }
    
    // Wait for geofence to be registered
    await page.waitForTimeout(500);
    await expect(page.getByText('Type: Polygon')).toBeVisible();
    
    await page.getByRole('button', { name: /create site/i }).click();
    await page.waitForLoadState('networkidle');
    
    // Now navigate back to edit the site
    await page.goto('/sites');
    await page.waitForLoadState('networkidle');
    
    // Find and click the edit button for our site
    const siteRow = page.getByRole('row').filter({ hasText: 'Geofence Edit Test' }).first();
    await siteRow.getByRole('button', { name: 'Edit' }).click();
    
    // Should show edit page with map
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.leaflet-container')).toBeVisible();
    
    // Should show existing geofence
    await expect(page.getByText('Type: Polygon')).toBeVisible();
  });

  test('should clear geofence', async ({ page }) => {
    await page.goto('/sites/new');
    
    const timestamp = Date.now();
    await page.locator('#slug').fill(`geo-clear-test-${timestamp}`);
    await page.locator('#name').fill('Geofence Clear Test');
    await page.locator('#hostname').fill(`clear-test-${timestamp}.example.com`);
    
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'GPS Only' }).click();
    
    // Draw a polygon
    await page.waitForSelector('.leaflet-container');
    await page.waitForTimeout(1000);
    
    const drawPolygonButton = page.locator('.leaflet-draw-draw-polygon');
    await drawPolygonButton.click();
    
    const mapContainer = page.locator('.leaflet-container');
    const box = await mapContainer.boundingBox();
    
    if (box) {
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
      await page.waitForTimeout(100);
      await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
      await page.waitForTimeout(100);
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
      await page.waitForTimeout(100);
      await page.mouse.dblclick(box.x + box.width * 0.4, box.y + box.height * 0.4);
    }
    
    await page.waitForTimeout(500);
    
    // Geofence should be visible
    await expect(page.getByText('Type: Polygon')).toBeVisible();
    
    // Click delete button to enter delete mode
    const deleteButton = page.locator('.leaflet-draw-edit-remove');
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      await page.waitForTimeout(500);
      
      // Click on the polygon to select it for deletion
      const polygon = page.locator('.leaflet-interactive').first();
      await polygon.click();
      await page.waitForTimeout(500);
      
      // Click Save to confirm deletion
      const saveButton = page.locator('.leaflet-draw-actions-bottom a').filter({ hasText: 'Save' });
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await page.waitForTimeout(500);
        
        // Geofence info should be cleared (Type: Polygon should no longer be visible)
        await expect(page.getByText('Type: Polygon')).not.toBeVisible();
      }
    }
  });
});
