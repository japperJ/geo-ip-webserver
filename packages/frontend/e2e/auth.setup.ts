import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate as super admin', async ({ page, request }) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

  // Ensure the super admin user exists (first user path or already-created path)
  const registerResponse = await request.post(`${baseURL}/api/auth/register`, {
    data: {
      email: 'admin@test.local',
      password: 'Test123!@#',
    },
    failOnStatusCode: false,
  });

  if (registerResponse.status() !== 201 && registerResponse.status() !== 409) {
    const responseBody = await registerResponse.text();
    throw new Error(`Registration precondition failed: ${registerResponse.status()} ${responseBody}`);
  }

  // Authenticate using real UI flow so browser context contains refresh cookie
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill('admin@test.local');
  await page.getByLabel('Password').fill('Test123!@#');
  await page.getByRole('button', { name: /sign in/i }).click();

  // Successful login should navigate to sites page
  await expect(page).toHaveURL(/\/sites/);

  // Save signed-in state to file
  await page.context().storageState({ path: authFile });
});
