import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
    testTimeout: 20000,
    exclude: ["node_modules/**", ".next/**", "e2e/**", "playwright.config.ts"],
    coverage: {
      provider: "v8",
      // No `all: true`. It was removed in @vitest/coverage-v8 v3 in favour of the `include`
      // list below, which is what "all" was approximating anyway: with an explicit include and
      // no `all`, uncovered files are still reported, which is the property the gate depends on.
      //
      // This was not a runtime problem — vitest ignored the unknown key and the coverage gate
      // passed — but `next build` typechecks this file, so the unknown property failed the
      // build step that generates the route types. A configuration key that only breaks one of
      // the two tools reading it is exactly the kind of thing that goes unnoticed.
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test-utils/**", "src/next-env.d.ts"],
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      // Floors are the measured value minus one point, so the gate catches a
      // regression without failing on ordinary churn — and, more importantly, is a number
      // that has actually been met at least once.
      //
      // Measured 2026-11-09 with `npm run test:coverage --workspace=frontend` (~64 files,
      // ~520 tests): statements ~43, branches ~38, functions ~42, lines ~44.
      //
      // The 340 original tests covered the API client, the schemas, the auth guard, the
      // sidebar and the auth pages. The route components under src/app/(app)/ now have specs
      // for every group (dashboard, stories, books, library, rentals, payments, notifications,
      // contests, messages, search), and the lib layer gained specs for queries, session,
      // preferences, site-url, count-readout and captcha. Every route-group page test lifts
      // every column, so the floors move from 38/33/33/38 to measured-minus-1.
      //
      // THE PLAN TO 80 IS NOT THIS COMMIT'S WORK. 80 statements, branches, functions and
      // lines is the project target; the gap remains in the [id] detail views and in the
      // admin/moderation/publisher surfaces under src/app/(app)/. Each floor below is
      // measured-minus-1 so ordinary churn does not trip it while the gate still guards
      // against meaningful coverage loss.
      thresholds: {
        statements: 42,
        branches: 37,
        functions: 41,
        lines: 43,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
