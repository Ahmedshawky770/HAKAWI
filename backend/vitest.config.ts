import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.spec.ts', '**/*.e2e-spec.ts', '**/index.ts'],
      thresholds: {
        lines: 70,
        functions: 45,
        branches: 60,
        statements: 69,
      },
    },
  },
  plugins: [tsconfigPaths()],
});
