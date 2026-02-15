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

  // Fetch user info to store in localStorage
  const meResponse = await request.get(`${baseURL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  expect(meResponse.ok(), 'Failed to fetch user info').toBeTruthy();
  const meData = await meResponse.json();
  const userData = meData.user; // Extract the user object from { success: true, user: {...} }

  // Debug logging
  console.log('User data from /api/auth/me:', JSON.stringify(userData, null, 2));
  console.log('User has role property?', 'role' in userData, 'Value:', userData.role);

  // Set localStorage with token and user for frontend use
  await page.goto(baseURL);
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(user));
    console.log('LocalStorage set - user:', JSON.stringify(user, null, 2));
  }, { token: accessToken, user: userData });

  // Save signed-in state to file
  await page.context().storageState({ path: authFile });
});
