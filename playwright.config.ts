import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';

/**
 * ShopVerse Playwright configuration.
 *
 * Projects
 *  - setup     : health check, DB reset/re-seed, saves logged-in storage states (runs first)
 *  - api       : pure API tests through Playwright's `request` (no browser)
 *  - chromium  : UI end-to-end tests (default browser)
 *  - firefox / webkit : same UI tests, only when selected explicitly (npm run test:cross-browser)
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_000 },

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  use: {
    baseURL: env.baseURL,
    testIdAttribute: 'data-testid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'api',
      testDir: './tests/api',
      dependencies: ['setup'],
    },
    {
      name: 'chromium',
      testDir: './tests/ui',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testDir: './tests/ui',
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testDir: './tests/ui',
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Optional: let Playwright boot the app (root `npm run dev` = API :5000 + Vite :5173).
  // The URL is checked through the Vite proxy, so it only passes when BOTH are up.
  webServer: env.startApp
    ? {
        command: 'npm run dev',
        cwd: '..',
        url: `${env.baseURL}/api/health`,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
