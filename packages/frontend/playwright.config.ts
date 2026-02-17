import { defineConfig, devices } from '@playwright/test';

const isEnvManagedServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30000,
  globalTimeout: 600000,
  maxFailures: 1,
  globalSetup: './e2e/global.setup.ts',
  use: {
    baseURL,
    actionTimeout: 10000,
    navigationTimeout: 15000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        ...(isEnvManagedServer
          ? { storageState: 'playwright/.auth/user.json' }
          : {}),
      },
      dependencies: isEnvManagedServer ? ['setup'] : [],
    },
  ],

  webServer: isEnvManagedServer
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 5173',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});

