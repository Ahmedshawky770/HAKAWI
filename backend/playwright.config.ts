import { defineConfig, devices } from '@playwright/test';

const FRONTEND_PORT = Number(process.env.PLAYWRIGHT_FRONTEND_PORT ?? 3000);
const BACKEND_PORT = Number(process.env.PLAYWRIGHT_BACKEND_PORT ?? 3001);
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const BACKEND_READY_URL = `${BACKEND_URL}/api/v1/stories?page=1&limit=1`;
const REPO_ROOT = '..';
const isCI = process.env.CI === 'true';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e-spec.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run start:dev',
      cwd: `${REPO_ROOT}/backend`,
      url: BACKEND_READY_URL,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev',
      cwd: `${REPO_ROOT}/frontend`,
      url: FRONTEND_URL,
      reuseExistingServer: !isCI,
      timeout: 240_000,
      env: {
        NEXT_PUBLIC_API_URL: `${BACKEND_URL}/api/v1`,
        NEXT_PUBLIC_APP_URL: FRONTEND_URL,
        NEXT_PUBLIC_APP_ENV: 'test',
      },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
