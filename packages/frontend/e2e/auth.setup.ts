import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate as super admin', async ({ page, request }) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
  
  // Register first user (becomes super_admin automatically)
  const registerResponse = await request.post(`${baseURL}/api/auth/register`, {
    data: {
      email: 'admin@test.local',
      password: 'Test123!@#',
    },
    failOnStatusCode: false,
  });

  // If registration fails with 409, user already exists - just login
  let accessToken: string;
  
  if (registerResponse.status() === 409) {
    console.log('User already exists, logging in...');
    // User exists, login
    const loginResponse = await request.post(`${baseURL}/api/auth/login`, {
      data: {
        email: 'admin@test.local',
        password: 'Test123!@#',
      },
    });
    
    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    accessToken = loginData.accessToken;
  } else {
    // Log response for debugging
    console.log('Register response status:', registerResponse.status());
    const responseBody = await registerResponse.text();
    console.log('Register response body:', responseBody);
    
    // Registration succeeded
    expect(registerResponse.ok(), `Registration failed: ${responseBody}`).toBeTruthy();
    const registerData = JSON.parse(responseBody);
    
    // Now login to get token
    const loginResponse = await request.post(`${baseURL}/api/auth/login`, {
      data: {
        email: 'admin@test.local',
        password: 'Test123!@#',
      },
    });
    
    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    accessToken = loginData.accessToken;
  }

  // Store authentication state
  await page.context().addCookies([{
    name: 'authToken',
    value: accessToken,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
  }]);

  // Set localStorage with token for frontend use
  await page.goto(baseURL);
  await page.evaluate((token) => {
    localStorage.setItem('authToken', token);
  }, accessToken);

  // Save signed-in state to file
  await page.context().storageState({ path: authFile });
});
