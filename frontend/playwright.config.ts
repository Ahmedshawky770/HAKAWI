import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = Number(process.env.PLAYWRIGHT_FRONTEND_PORT ?? 3000);
const BACKEND_PORT = Number(process.env.PLAYWRIGHT_BACKEND_PORT ?? 3001);
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const BACKEND_READY_URL = `${BACKEND_URL}/api/v1/stories?page=1&limit=1`;
const REPO_ROOT = "..";
const isCI = process.env.CI === "true";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e-spec.ts",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  outputDir: "./coverage/playwright-test-results",
  reporter: isCI ? [["github"], ["html", { open: "never", outputFolder: "./coverage/playwright-report" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run start:dev",
      cwd: `${REPO_ROOT}/backend`,
      url: BACKEND_READY_URL,
      reuseExistingServer: !isCI,
      // A cold `nest start --watch` recompiles the whole project before it can serve, so
      // this budget has to cover a full TypeScript build on a loaded CI runner.
      timeout: 300_000,
      // Pinning the port keeps the readiness probe and the server on the same port. Left to
      // itself Nest and Next both fall forward to a free port when the configured one is
      // taken, and the probe then waits out the whole timeout on a port nobody is serving.
      // CORS_ORIGIN has to name the port the frontend is actually on, not the default 3000:
      // a credentialed cross-origin POST is preflighted, so an origin the API does not
      // allow never reaches the handler and the page only reports "Failed to fetch".
      env: { PORT: String(BACKEND_PORT), CORS_ORIGIN: FRONTEND_URL },
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT}`,
      cwd: `${REPO_ROOT}/frontend`,
      url: FRONTEND_URL,
      reuseExistingServer: !isCI,
      // Next.js compiles every route on first request in dev mode, so the first paint of a
      // cold app is slow even though the port answers early.
      timeout: 300_000,
      env: {
        PORT: String(FRONTEND_PORT),
        NEXT_PUBLIC_API_URL: `${BACKEND_URL}/api/v1`,
        NEXT_PUBLIC_APP_URL: FRONTEND_URL,
        NEXT_PUBLIC_APP_ENV: "test",
      },
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
