import path from 'node:path';

import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

import { swcTypeScript } from './vitest.swc-plugin.ts';

interface DocumentedExclusion {
  readonly pattern: string;
  readonly reason: string;
}

const NOT_SOURCE: readonly DocumentedExclusion[] = [
  { pattern: 'node_modules/**', reason: 'Third-party code is not ours to cover.' },
  { pattern: 'dist/**', reason: 'Build output, produced from src.' },
  { pattern: 'coverage/**', reason: 'Coverage report output.' },
  { pattern: '**/*.spec.ts', reason: 'The test itself, never the subject under test.' },
  { pattern: '**/*.e2e-spec.ts', reason: 'Measured by vitest.config.e2e.ts, which needs a migrated database.' },
  { pattern: '**/*.d.ts', reason: 'Ambient declarations contain no runtime code.' },
  { pattern: 'src/test/**', reason: 'E2E harness helpers owned by the isolation stream, not application code.' },
  { pattern: 'src/e2e/**', reason: 'E2E harness owned by the isolation stream, not application code.' },
  { pattern: 'src/db/schema/**', reason: 'Pure Drizzle DDL: table and column declarations, zero runtime branches.' },
  {
    pattern: 'src/db/migrations/**',
    reason: 'Generated, one-shot SQL migrations; replaying them in a unit test proves nothing.',
  },
];

/**
 * Exclusions that are a matter of judgement rather than of what is source.
 *
 * Empty on purpose. `src/modules/**\/repositories/**` used to sit here with a note explaining
 * that the 17 repository specs "are outside this change set". They are no longer: every
 * repository now has a sibling spec that replaces the module-level Pool from
 * `src/db/index.ts` with a fluent Drizzle double, so the layer where the SQL is composed is
 * inside the gate rather than exempt from it. Keeping the entry would have left the gate
 * reporting a coverage number that quietly skipped 2100 lines of query-building code.
 */
const DOCUMENTED: readonly DocumentedExclusion[] = [];

/**
 * Floors are the honest measured value minus roughly two points, so the gate
 * catches regressions without failing on ordinary churn. Raise a floor only
 * when the code beneath it is genuinely covered.
 *
 * Measured on 2026-09-30 with `npx vitest run --coverage` (103 files, 1765 tests):
 * lines 81.42, statements 80.43, branches 75.85, functions 72.43.
 */
const THRESHOLDS = {
  lines: 79,
  functions: 70,
  branches: 73,
  statements: 78,
  'src/common/utils/**': { lines: 92, functions: 78, branches: 95, statements: 92 },
  'src/common/middleware/waf.middleware.ts': { lines: 86, functions: 100, branches: 76, statements: 86 },
  'src/common/waf/**': { lines: 96, functions: 100, branches: 94, statements: 96 },
  'src/common/throttler/**': { lines: 94, functions: 100, branches: 89, statements: 94 },
  'src/common/resilience/**': { lines: 89, functions: 100, branches: 84, statements: 89 },
  'src/common/services/valkey.service.ts': { lines: 98, functions: 98, branches: 98, statements: 98 },
  'src/common/observability/sentry.config.ts': { lines: 98, functions: 98, branches: 98, statements: 98 },
  'src/modules/moderation/admin-dashboard.service.ts': { lines: 98, functions: 98, branches: 96, statements: 98 },
  'src/modules/badges/badges.service.ts': { lines: 79, functions: 88, branches: 56, statements: 81 },
};

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'src/**/*.e2e-spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'coverage/**', 'test/**', 'src/e2e/**', 'src/modules/**/e2e/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [...NOT_SOURCE.map((entry) => entry.pattern), ...DOCUMENTED.map((entry) => entry.pattern)],
      thresholds: THRESHOLDS,
    },
  },
  plugins: [swcTypeScript(), tsconfigPaths()],
  resolve: {
    alias: [
      {
        find: /^@hakawi\/shared-types$/,
        replacement: path.resolve(__dirname, '../packages/shared-types/src/index.ts'),
      },
    ],
  },
});
