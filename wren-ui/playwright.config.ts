import { defineConfig, devices } from '@playwright/test';

const skipDbSetup = process.env.PLAYWRIGHT_SKIP_DB_SETUP === '1';
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === '1';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const webServerPort = process.env.PLAYWRIGHT_PORT || '3000';

export default defineConfig({
  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: 'e2e',

  // Each test is given 60 seconds.
  timeout: 1 * 60 * 1000,

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: false,

  // Retry on CI only.
  retries: 0,

  // Opt out of parallel tests on CI.
  workers: 1,

  // Reporter to use
  reporter: 'html',

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL,

    // Collect trace when retrying the failed test.
    trace: 'on-first-retry',
  },
  // Configure projects for major browsers.
  projects: [
    ...(skipDbSetup
      ? []
      : [
          {
            name: 'setup db',
            testMatch: /global\.setup\.ts/,
            teardown: 'cleanup db',
          },
          {
            name: 'cleanup db',
            testMatch: /global\.teardown\.ts/,
          },
        ]),
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: skipDbSetup ? [] : ['setup db'],
    },
  ],
  // Run your local dev server before starting the tests.
  webServer: skipWebServer
    ? undefined
    : {
        command:
          process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ||
          `NODE_ENV=test yarn start -p ${webServerPort}`,
        url:
          process.env.PLAYWRIGHT_BASE_URL ||
          `http://127.0.0.1:${webServerPort}`,
        reuseExistingServer: true,
      },
});
