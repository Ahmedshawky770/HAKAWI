import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/e2e/**/*.e2e-spec.ts', 'test/**/*.e2e-spec.ts', 'test/**/*.integration-spec.ts'],
    exclude: ['e2e/**/*.e2e-spec.ts'],
    setupFiles: ['./src/e2e/setup.ts'],
    transform: {
      '^.+\\.ts$': '@swc/transform',
    },
  },
});
