import { test } from '@playwright/test';

test('debug console errors', async ({ page }) => {
  const errors: string[] = [];
  
  page.on('console', (msg) => {
    console.log(`[${msg.type()}]`, msg.text());
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  page.on('pageerror', (error) => {
    console.log('PAGE ERROR:', error.message);
    errors.push(error.message);
  });
  
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      console.log(`API ${response.status()}: ${url}`);
      if (response.status() >= 400) {
        try {
          const body = await response.text();
          console.log('Error body:', body);
        } catch (e) {
          // ignore
        }
      }
    }
  });
  
  await page.goto('/');
  await page.waitForTimeout(5000);
  
  console.log('Total errors:', errors.length);
  errors.forEach((err, idx) => {
    console.log(`Error ${idx + 1}:`, err);
  });
});
