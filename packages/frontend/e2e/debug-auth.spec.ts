import { test, expect } from '@playwright/test';

test('debug localStorage', async ({ page }) => {
  await page.goto('/');
  
  // Check localStorage
  const localStorage = await page.evaluate(() => {
    return {
      authToken: window.localStorage.getItem('authToken'),
      user: window.localStorage.getItem('user'),
      userParsed: JSON.parse(window.localStorage.getItem('user') || 'null'),
    };
  });
  
  console.log('localStorage contents:', JSON.stringify(localStorage, null, 2));
  console.log('User has role?', localStorage.userParsed && 'role' in localStorage.userParsed);
  
  expect(localStorage.authToken).toBeTruthy();
  expect(localStorage.user).toBeTruthy();
  expect(localStorage.userParsed).toHaveProperty('role');
  expect(localStorage.userParsed?.role).toBe('super_admin');
});
