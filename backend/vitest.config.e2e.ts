import path from 'node:path';

import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

import { swcTypeScript } from './vitest.swc-plugin.ts';

const TEST_DATABASE = 'hakawi_test';
const TEST_VALKEY_PORT = '6379';
// The datastores the harness talks to are overridable because a hardcoded port makes the suite
// unrunnable on any machine where 5432 or 6379 is already claimed by another container — the suite
// then fails in `globalSetup` for a reason that has nothing to do with the code under test. Defaults
// are unchanged, so CI behaves exactly as before.
const TEST_DB_PORT = process.env.TEST_DB_PORT ?? '5432';
const TEST_DB_HOST = process.env.TEST_DB_HOST ?? 'localhost';
const TEST_DB_USER = process.env.TEST_DB_USER ?? 'postgres';
const TEST_DB_PASSWORD = process.env.TEST_DB_PASSWORD ?? 'postgres';

export default defineConfig({
  plugins: [swcTypeScript(), tsconfigPaths()],
  // Single Source of Truth (docs/09_single_source_of_truth.md): the e2e harness must resolve
  // @hakawi/shared-types the same way the unit harness does. Without this alias the suite
  // depends on packages/shared-types/dist, which is gitignored, so a clean checkout fails to
  // resolve it. Aliasing to source also removes the build-order dependency on the CI job.
  resolve: {
    alias: [
      {
        find: /^@hakawi\/shared-types$/,
        replacement: path.resolve(__dirname, '../packages/shared-types/src/index.ts'),
      },
    ],
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.e2e-spec.ts', 'test/**/*.e2e-spec.ts', 'test/**/*.integration-spec.ts'],
    exclude: ['e2e/**/*.e2e-spec.ts', 'node_modules/**', 'dist/**'],
    globalSetup: ['./src/e2e/global-setup.ts'],
    setupFiles: ['./src/e2e/setup.ts'],
    pool: 'forks',
    maxWorkers: 4,
    isolate: true,
    fileParallelism: true,
    env: {
      NODE_ENV: 'test',
      DB_HOST: TEST_DB_HOST,
      DB_PORT: TEST_DB_PORT,
      DB_NAME: TEST_DATABASE,
      DB_USER: TEST_DB_USER,
      DB_PASSWORD: TEST_DB_PASSWORD,
      VALKEY_HOST: 'localhost',
      VALKEY_PORT: TEST_VALKEY_PORT,
      VALKEY_PASSWORD: '',
      // The suite raises the limit rather than removing throttling, so the 429 paths stay
      // testable. Setting THROTTLE_TTL / THROTTLE_LIMIT is a rate-limit bypass that
      // `buildThrottleConfig` refuses unless it is acknowledged (fatal under
      // NODE_ENV=production); this is that acknowledgement, and it is scoped to the test
      // harness only. See backend/src/config/throttle.config.ts.
      THROTTLE_TTL: '60000',
      THROTTLE_LIMIT: '100000',
      THROTTLE_ALLOW_GLOBAL_OVERRIDE: 'true',
      JWT_SECRET: 'test-jwt-secret-key-for-testing-only-1234567890',
      REFRESH_TOKEN_SECRET: 'test-refresh-secret-key-for-testing-only-1234567890',
      ENCRYPTION_KEY: 'test-encryption-key-for-testing-only-1234567890',
      DATABASE_URL: `postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DATABASE}`,
      VALKEY_URL: `redis://localhost:${TEST_VALKEY_PORT}`,
    },
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
