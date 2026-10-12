import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
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
      // Floors are the measured value minus roughly two points, so the gate catches a
      // regression without failing on ordinary churn — and, more importantly, is a number
      // that has actually been met at least once.
      //
      // Measured 2026-10-01 with `npm run test:coverage` (21 files, 340 tests):
      //   statements 39.79   branches 35.90   functions 35.74   lines 40.22
      //
      // WHAT THESE FLOORS WERE: statements 42, branches 85, functions 51, lines 42. None of
      // them had ever been met. The gate had never verified anything, because `main` failed
      // earlier in the pipeline — at `npm audit` and `Lint Backend` — and never reached this
      // step. A threshold nobody has satisfied is not a gate; it is a wish.
      //
      // WHY COVERAGE IS ONLY ~40%: almost every page component is at 0%. The 340 tests cover
      // the API client, the schemas, the auth guard, the sidebar and the auth pages, but the
      // 28 route components under src/app/(app)/ are untested — books, contests, library,
      // rentals, payments, messages, notifications, search and each of their [id] views. That
      // is the honest state of this codebase, not a measurement problem.
      //
      // Raising these is real work that has NOT been done here. The direction is set by the
      // number now being reachable: any commit that adds an untested component will fail,
      // which is the property the previous floors lacked.
      //
      // ⛔ RAISED 2026-10-12, MEASURED 3 POINTS BELOW THE RUN, NOT ASPIRING TO A TARGET.
      // The suite has since grown to ~58 files / 480 tests (api client, schemas, auth guard,
      // providers, the social/rental/library/UI components, sanitize-html) and now measures
      // 72.13 statements / 67.54 branches / 69.13 functions / 72.90 lines. These floors move
      // from 38/33/33/38 to 69/64/66/69 — measured minus three — because the old ones had
      // ~30 points of headroom, which means they could not detect a regression and existed
      // only to hold a number.
      //
      // THE PLAN TO 80 IS NOT THIS COMMIT'S WORK, AND IT IS NOT YET DONE. 80 statements,
      // branches, functions and lines is the project target; the gap is concentrated in the
      // route components under `src/app/(app)/`, which stay at 0% because rendering them means
      // standing up the router, the providers and the fetch layer. Each floor below is
      // measured-minus-3 so ordinary churn does not trip it, and the route to 80 is one spec
      // per route group at a time: page tests are additive, so every one of them lifts every
      // column. This comment is the record of the intent so the next reader does not mistake
      // 69 for the target — the target is 80 and the number here is the floor.
      thresholds: {
        statements: 69,
        branches: 64,
        functions: 66,
        lines: 69,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
