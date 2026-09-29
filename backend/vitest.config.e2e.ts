import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/e2e/**/*.e2e-spec.ts', 'src/modules/**/e2e/**/*.e2e-spec.ts', 'test/**/*.e2e-spec.ts', 'test/**/*.integration-spec.ts'],
    exclude: ['e2e/**/*.e2e-spec.ts'],
    setupFiles: ['./src/e2e/setup.ts'],
    transform: {
      '^.+\\.ts$': {
        use: '@swc/transform',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
              decorators: true,
            },
            transform: {
              decoratorMetadata: true,
            },
          },
        },
      },
    },
    env: {
      JWT_SECRET: 'test-jwt-secret-key-for-testing-only-1234567890',
      REFRESH_TOKEN_SECRET: 'test-refresh-secret-key-for-testing-only-1234567890',
      ENCRYPTION_KEY: 'test-encryption-key-for-testing-only-1234567890',
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/hakawi_test',
      VALKEY_URL: 'redis://localhost:6379',
    },
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
