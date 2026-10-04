# Testing Strategy
## Hakawi - Test Pyramid, Suites, and Coverage

Everything in this document was measured by running the suites. The figures below were
**re-measured on 2026-10-04**; the 2026-09-30 measurement is superseded and every number that changed
is listed in the changelog at the end.

**Read the next section before you trust any number in this file.** For several months this document
reported green suites that were not executing at all.

---

## ⛔ The suites were green because they were not running

This is the most important thing this document has to say, and it is the failure mode this file
itself demonstrated for several months.

**What was true.** The Nest module graph could not be constructed. The backend **could not boot**,
and the entire database-backed suite — 23 files — reported *skipped* on every run. CI was green on
every push. Two independent causes:

| # | Site | Symptom |
|---|---|---|
| 1 | `books.module.ts` ↔ `library.module.ts` | A real circular module dependency with **no `forwardRef()`** on either side, so one class evaluated to `undefined` at import time. Nest aborted with *"The module at index [3] of the LibraryModule `imports` array is undefined"* |
| 2 | `contests.module.ts:5` | Imported `NotificationsModule` but never listed it in `imports`, so the import was dead and `ContestsEventHandler` could not resolve `NotificationsService` |

**Why it stayed invisible.** Both failures happen inside `DependenciesScanner.scanForModules`, which
runs **before any test body and before `beforeAll`**. Vitest therefore reported each affected file as
*skipped*, not *failed* — and a suite in which everything is skipped exits **0**. A green run of this
file's own subject matter was, for months, evidence of nothing. Only the frontend container came up,
which is why nothing noticed.

**What happened once the suite could actually run.** **8 e2e/integration tests that had never
executed were failing.** All eight were stale tests and fixtures rather than production bugs, and all
eight are now fixed — among them a fixture that discarded its own login token before asserting 401, a
category fixture using an ordinary reader where the route requires a moderator, and an entire library
suite written against `POST /library` when the real route is `POST /library/claim`.

**Status: fixed.** `forwardRef()` is on both sides of the books/library cycle and
`NotificationsModule` is listed in `contests.module.ts`'s `imports`. Current e2e result: **23/23
files, 173 passed, 0 failed, 0 skipped.**

### The control that would have caught it

Any one of these, all cheap, and none of which existed:

- **A boot smoke test.** `NestFactory.create(AppModule)` in a job with no database, asserting only
  "does not throw". The whole class of defect is a constructor-time error, so it needs no fixture and
  no seeded data.
- **Fail an all-skipped run.** `--passWithNoTests` treated as a failure, plus an expected-test-count
  assertion in `vitest.config.e2e.ts`. A suite where everything is skipped must not exit 0.
- **Lint the module's own `imports` array** against its imports. Defect #2 is a file that imports a
  module and does not list it — statically checkable, and no test would ever have found it while the
  suite skipped.

### A related trap that is now fixed

`vitest.config.e2e.ts` hardcoded PostgreSQL on **5432**, so the suite failed in `globalSetup` on any
machine where that port was already claimed — an environment failure whose output is
indistinguishable, to the reader, from the defect above. The datastore is now overridable via
`TEST_DB_PORT` / `TEST_DB_HOST` / `TEST_DB_USER` / `TEST_DB_PASSWORD`, with the defaults unchanged so
CI behaves identically.

---

## Measured State

| Suite | Runner | Config | Files | Tests | Result |
|---|---|---|---|---|---|
| Backend unit | **Vitest 5** | `backend/vitest.config.ts` | **151** | **3228** | ✅ all pass |
| Backend integration / e2e | **Vitest 5** | `backend/vitest.config.e2e.ts` | **23** | **173** | ✅ 23/23 files, **0 skipped** |
| Frontend unit + component | **Vitest 5** | `frontend/vitest.config.ts` | **22** | **356** | ✅ all pass |
| Frontend browser e2e | **Playwright ^1.63** | `frontend/playwright.config.ts` | **3** | **15** | ✅ real browser + axe-core WCAG |

**Total: 3757 non-browser tests, plus one Playwright suite of 15.**

⛔ **Corrected — the previous version of this table was wrong in five ways at once.** It reported
**104 / 1792** backend unit, **23 / 146 (+1 `it.fails` pin)** e2e, **21 / 340** frontend, a
**1-file / 10-test backend Playwright suite**, and a **2-file frontend Playwright suite** — a total of
"2192 non-browser tests, plus two Playwright suites".

- There is **no `it.fails` anywhere in this repository**: `grep -rn "it.fails" backend` returns 0
  hits. The "(+1 `it.fails` pin)" was fabricated, and so was the Best Practice §2 that described
  `it.fails` as the project's mechanism for pinning a known defect. Both claims are removed rather
  than rephrased.
- **There is no backend Playwright suite.** `backend/playwright.config.ts` **does not exist** — the
  only Playwright config in the tree is `frontend/playwright.config.ts`. This document contradicted
  itself: the *Running the Suites* section already said the backend config "was deleted, because no
  CI step ever invoked them", while this table still listed a backend suite with 10 tests in it.
- The frontend Playwright suite is **3 files / 15 tests** (`accessibility`, `api-critical-paths`,
  `journeys`), not 2.
- `find backend/src -name "*.spec.ts"` returns **151** files, not 104; the drift was 47 files.

### ✅ One Vitest major, not two

⛔ **Corrected.** This section previously claimed the backend ran **Vitest 5.0.1** and the frontend
**pinned Vitest 2.1.9** in its own `node_modules`, described as "a real trap when running coverage
from the repo root". **Both workspaces now declare `vitest@^5.0.3` and `@vitest/coverage-v8@^5.0.3`.**
The split is closed, so the resolution trap no longer exists and no `test` script needs to work
around it. The historical finding — that Vitest 5 removed `test.transform`, which had silently
disabled DTO validation across the whole e2e suite — remains true and remains important; see *The
SWC transform* below.

---

## Coverage

### Backend — above the gate

```
All files   | % Stmts   | % Branch | % Funcs | % Lines
       213  |     84.28 |    80.49 |   78.86 |   84.45
```

Configured floors in `backend/vitest.config.ts:77-91`:

| Metric | Floor | Measured | Headroom |
|---|---|---|---|
| Statements | 78 | 84.28 | +6.28 |
| Branches | 73 | 80.49 | +7.49 |
| Functions | 70 | 78.86 | +8.86 |
| Lines | 79 | 84.45 | +5.45 |

⛔ **Corrected.** This table previously reported **85.43 / 82.39 / 79.00 / 85.58**. Those figures were
**higher on every metric** than what the suite actually produces. A third, different set
(L 86.52 / S 86.33 / B 83.31 / F 79.74) was quoted in the comment block of `backend/vitest.config.ts`,
so three mutually inconsistent coverage sets were circulating; **all three were wrong.** The floors
themselves are unchanged and verified against `THRESHOLDS`.

⚠️ **Note the floor ordering.** The floors are declared in the config as
`lines: 79, functions: 70, branches: 73, statements: 78`, which in S/B/F/L order is **78 / 73 / 70 /
79**. Earlier revisions of this document printed them as "78/70/73/79", which transposes branches and
functions and therefore misstates which floor binds hardest. Branches at 73 are the tightest relative
constraint, not functions at 70.

Plus **nine per-path ratchets** that are tighter than the global floor:

| Path | Floor (L/F/B/S) |
|---|---|
| `src/common/utils/**` | 92 / 78 / 95 / 92 |
| `src/common/middleware/waf.middleware.ts` | 86 / 100 / 76 / 86 |
| `src/common/waf/**` | 96 / 100 / 94 / 96 |
| `src/common/throttler/**` | 94 / 100 / 89 / 94 |
| `src/common/resilience/**` | 89 / 100 / 84 / 89 |
| `src/common/services/valkey.service.ts` | 98 / 98 / 98 / 98 |
| `src/common/observability/sentry.config.ts` | 98 / 98 / 98 / 98 |
| `src/modules/moderation/admin-dashboard.service.ts` | 98 / 98 / 96 / 98 |
| `src/modules/badges/badges.service.ts` | 79 / 88 / 56 / 81 |

`coverage.all` is **on**, so all 213 in-scope files are measured whether or not a test imports them.

**What is deliberately excluded, and why** (`backend/vitest.config.ts:8-37`):

- Not source: `node_modules/**`, `dist/**`, `coverage/**`, `**/*.spec.ts`, `**/*.e2e-spec.ts`,
  `**/*.d.ts`
- Harness: `src/test/**`, `src/e2e/**` (owned by the isolation harness, not application code)
- `src/db/schema/**` — pure Drizzle DDL: table and column declarations, zero runtime branches
- `src/db/migrations/**` — generated, one-shot SQL; replaying it in a unit test proves nothing
- `src/modules/**/repositories/**` — **17 files, unmeasured by choice.** They import the
  module-level `Pool` from `src/db/index.ts`, so a unit test would exercise a real PostgreSQL
  connection rather than the query builder. This is the largest honest gap in the backend suite.

### Frontend — below the 80% target

```
All files   | % Stmts   | % Branch | % Funcs | % Lines
        22  |     40.75 |    35.79 |   39.64 |   41.25
```

| Metric | Floor | Measured | Headroom |
|---|---|---|---|
| Statements | 38 | 40.75 | +2.75 |
| Branches | 33 | 35.79 | +2.79 |
| Functions | 33 | 39.64 | +6.64 |
| Lines | 38 | 41.25 | +3.25 |

⛔ **Corrected.** This table previously reported **39.79 / 35.90 / 35.74 / 40.22**, and the file
count as 21. The measured values are **40.75 / 35.79 / 39.64 / 41.25** across **22** files. Branches
and statements are now close to their floors — statements clears by only 2.75 points — so the
frontend gate is genuinely tight rather than comfortably met.

⚠️ **The backend is above the 80% target; the frontend is not, by a wide margin.** Every metric is
around 36–41%, and the floors sit just under the measured values so the gate is a ratchet rather than
a target — which means a green frontend build certifies roughly 40%, not 80%. The page and component
files (`api.ts`, `types.ts`, most `app/**/page.tsx`) are the untested bulk.

⛔ **Corrected.** This paragraph previously reported the frontend as S 44.25 / B 87.05 / F 53.69 /
L 44.25 against floors 42/85/51/42, and concluded that "**every** metric has since gone down". That
sequence of figures was never measured: a branches value of **87.05** against a **40.75** measurement
is not a decline, it is a different measurement, and the "every metric has gone down" conclusion was
built on comparing two numbers that were never comparable. The floors were then moved again, to
**38/33/33/38**. Only the current pair above is real.

Reaching 80% on the frontend is open work; see
`docs/roadmap/phases/implementation-roadmap.md` → *Open Items*.

---

## Test Pyramid

```
        /\
       /  \         Playwright browser tests
      / /\ \        frontend: 3 files, 15 tests
     /____\         (journeys, accessibility, api-critical-paths)
    /      \        real Chromium, page.goto / fill / click / waitForURL,
   /--------\       asserting response.status() on the real XHR
  /          \
 /   E2E /    \      backend integration: 23 files, 173 tests
/ Integration \     a REAL Nest app + a per-test-file CLONED database
/______________\     (11 src/**/e2e-spec.ts + test/app.e2e-spec.ts + 11 integration)
    /        \
   /  Unit    \     backend: 151 files, 3228 tests
  /            \    frontend: 22 files, 356 tests
 /______________\
```

---

## Tooling — what is actually installed

| Concern | Tool | Package |
|---|---|---|
| Unit + integration runner | **Vitest** | `vitest` **5.0.3** in both workspaces (the 2.x/5.x split is closed) |
| Coverage | `@vitest/coverage-v8` (v8 provider) | 5.0.3 in both workspaces |
| Browser e2e | **Playwright** | `@playwright/test` ^1.63.0 |
| Accessibility | **axe-core** | `@axe-core/playwright` ^4.10.2 (frontend only) |
| DOM testing | Testing Library | `@testing-library/react` ^16, `@testing-library/jest-dom`, `@testing-library/user-event` |
| Decorator metadata in tests | SWC via a local Vite plugin | `backend/vitest.swc-plugin.ts` |
| HTTP assertions | **Supertest** | `supertest` ^7.0.0 + `@types/supertest` ^7.0.0. ⛔ **This row previously said Supertest was "`@types`-only" and "not used to drive any test". That was wrong** — it is a real dependency and **46** files import it, **23 of them inside the unit run** |

> ⛔ **Correction, and it matters beyond this table.** Supertest drives real HTTP against a real Nest
> application inside the *unit* suite, in 23 files. This document said otherwise, and the changelog
> below repeated it ("Supertest is a `@types`-only dependency and drives no test"). Anyone reading it
> would conclude the unit suite never exercises the HTTP layer — the opposite of the truth. What
> remains true is the narrower point in *Database Isolation*: Supertest-against-one-shared-database
> is not how the **DB-backed** suite isolates, which uses a cloned database per file instead.

### ⚠️ The SWC transform, and why it mattered

Vitest 5 **removed `test.transform`**. The old e2e config used
`transform: { '^.+\\.ts$': { use: '@swc/transform' } }`, which was silently ignored — so
`design:paramtypes` was never emitted, `reflectParamTypes` found no metatype, and the global
`ValidationPipe` **never validated a single DTO in the whole e2e suite**. Every request went through
unvalidated.

Fixed with `swcTypeScript()`, a local Vite plugin (`backend/vitest.swc-plugin.ts`) applied in both
`vitest.config.ts` and `vitest.config.e2e.ts`. This is why the unit config now also has a `plugins`
block; without it, a unit test cannot observe DTO coercion either.

### Frontend has no `paths` alias for shared-types
`frontend/vitest.config.ts` aliases only `@` → `frontend/src`. Shared types resolve to the
**compiled** `@hakawi/shared-types` package. The old alias pointed at
`packages/shared-types/src`, whose NodeNext `.js` specifiers Vite would have to resolve.

⚠️ **The backend config does alias shared-types to source**, and the reason applies to the e2e suite
specifically: `vitest.config.e2e.ts` maps `@hakawi/shared-types` to
`packages/shared-types/src/index.ts` so the harness does not depend on `packages/shared-types/dist`,
which is gitignored. Without that alias a clean checkout fails to resolve it. The unit config carries
the same alias.

---

## Test Layout — the real one

```
backend/
├── src/
│   ├── **/*.spec.ts            151 unit test files, co-located with the code
│   ├── **/*.e2e-spec.ts        11 e2e files under src/ (auth.e2e-spec.ts + modules/**/e2e/)
│   ├── modules/**/e2e/         module-scoped e2e (books, categories, contests, email-verification,
│   │                           library, payments, rentals, stories, tags, upload)
│   ├── e2e/                    the harness: global-setup.ts, setup.ts, build-template-database.ts
│   └── test/helpers/           test-database.ts, test-database-scope.ts, test-isolation.util.ts,
│                               test-context.ts
├── test/                       12 DB-backed files + mocks/
│   ├── app.e2e-spec.ts
│   ├── {auth,users,stories,search,comments,follows,messages,notifications,moderation,reactions}
│   │   .integration-spec.ts
│   ├── notifications.phase3.integration-spec.ts
│   └── mocks/                  repositories.mock.ts, stories.mock.ts
└── e2e/                        ⛔ absent — the backend Playwright suite and its config were deleted

frontend/
├── src/**/*.test.ts(x)         22 files
└── e2e/                        Playwright, 3 files: journeys.e2e-spec.ts,
                                accessibility.e2e-spec.ts, api-critical-paths.e2e-spec.ts
```

⛔ **Corrected.** The previous version of this tree said "**104** unit test files", "**12**
guard/module e2e files", "**11** DB-backed integration files" and "**21** files" for the frontend —
and listed a `backend/e2e/` directory containing `journeys.e2e-spec.ts` and
`api-critical-paths.e2e-spec.ts`. **That directory does not exist and those files are in
`frontend/e2e/`,** where `frontend/playwright.config.ts` (`testDir: "./e2e"`) points. The listing had
the browser suite filed under the wrong workspace entirely.

The DB-backed count is **12** files under `backend/test/` (11 `*.integration-spec.ts` +
`app.e2e-spec.ts`); with the 11 under `src/`, that is the **23** files the e2e config includes. The
`notifications.phase3.integration-spec.ts` entry was also missing from the enumeration.

### ⛔ Layout that never existed
- `jest-e2e.json` — there is no Jest anywhere. `find . -name 'jest*'` finds nothing
- `src/test/e2e/` — the harness is `src/e2e/` plus `src/modules/**/e2e/` plus `test/`
- `faker` fixtures — **`faker` is not a dependency of either workspace.** The mocks in
  `backend/test/mocks/` are hand-written fixtures, not generated
- Test factories — there is no factory pattern; fixtures are literal objects in `*.mock.ts`

---

## Database Isolation — how the e2e suite actually works

Transaction-per-test rollback is **impossible** here: `backend/src/db/index.ts` builds a
module-level `Pool` at import time and roughly 30 services import that singleton directly, so no
per-test handle can be injected. Supertest-against-one-database is not used either.

The real mechanism (`backend/src/test/helpers/test-database-scope.ts`):

1. **Global setup** (`src/e2e/global-setup.ts`) migrates **one template database** for the run,
   naming it with a run-scoped id.
2. **Each test file** sets `process.env.DB_NAME` in its own scope, so the app's `db` module
   evaluates against a **database cloned from the template**. Measured clone time ≈ **250ms**,
   versus **6.1s** to migrate from scratch per file.
3. Teardown drops each clone with `DROP DATABASE ... WITH (FORCE)`; a 6-hour reaper sweeps stale
   run-scoped databases.
4. **No `TRUNCATE` anywhere.** `cleanTestData` / `truncateAllTables` were removed.
5. `isolate: true`, `maxWorkers: 4`, `fileParallelism: true`.

> The old config had `maxForks: 1`, which is **dead** — Vitest 5 uses `maxWorkers`. So every e2e
> file was running fully parallel against **one** database. That was the source of the intermittent
> failures; the suite now passes 23/23 with 0 skipped.

Required services for the e2e suite: a live PostgreSQL and a live Valkey. The defaults are
PostgreSQL on **5432** and Valkey on **6379**, and both are now overridable —
`TEST_DB_PORT` / `TEST_DB_HOST` / `TEST_DB_USER` / `TEST_DB_PASSWORD` for PostgreSQL. See the trap
noted at the top of this document.
`vitest.config.e2e.ts` also sets `THROTTLE_LIMIT=100000` to switch throttling off (see
`docs/security-architecture/waf/waf-overview.md` → *Escape hatch*).

---

## Running the Suites

```bash
# Backend unit (also the coverage gate)
npm test

# Backend unit, watch mode
npm run test:watch --workspace=backend

# Backend integration / e2e — needs a live PostgreSQL and Valkey
npm run test:e2e --workspace=backend

# Browser e2e — the frontend suite starts the backend and the frontend itself.
# There is ONE browser runner: `backend/playwright.config.ts` and its
# `test:e2e:playwright` script were deleted, because no CI step ever invoked them and the
# `test-browser` job runs the frontend suite.
npm run test:e2e --workspace=frontend

# Frontend
npm run test:run --workspace=frontend
npm run test:coverage --workspace=frontend
```

⛔ **`npm run test:cov:check` does not exist** and never has. It was documented here twice. The
backend coverage gate runs as part of `npm test`; the frontend's is
`npm run test:coverage --workspace=frontend`.

---

## CI Pipeline

`.github/workflows/ci.yml` — **11 jobs, no advisory gates**:

| # | Job | Name | Gate |
|---|---|---|---|
| 1 | `lint` | Lint & Type Check | hard |
| 2 | `test-unit` | Unit Tests | hard |
| 3 | `test-frontend` | Frontend Tests | hard |
| 4 | `test-coverage` | Coverage Gate | hard |
| 5 | `test-e2e` | E2E Tests | **hard** |
| 6 | `test-browser` | Browser Tests (Playwright) | hard |
| 7 | `migration-premerge` | Migration Lint (no database) | hard |
| 8 | `migration-verify` | Migration Smoke Test (from scratch) | hard |
| 9 | `migration-roundtrip` | Migration Round Trip (down and back) | hard |
| 10 | `security` | Security Audit | hard |
| 11 | `build` | Build Application | hard |

⛔ **Corrected — there are 11 jobs, not 10, and the previous list was missing two of them.** It also
numbered only nine rows against a "10 jobs" heading, so it was internally inconsistent before this
correction. Measured against `.github/workflows/ci.yml`:

- **`migration-roundtrip`** (line 486) — applies the chain, rolls every migration back, asserts the
  down scripts actually dropped their objects, re-applies, and asserts the schema matches. It is the
  only gate that would notice a `DROP TABLE` quietly missing from a down script.
- **`test-browser`** (line 283) — the Playwright job, which is where the frontend browser suite
  actually runs.

⛔ **`test-e2e` was green and proving nothing.** It is a hard gate and it passed — while the 23 files
it ran were skipping, for the reasons at the top of this document. A hard gate over a suite that does
not execute is worse than no gate: it converts a known unknown into an assumed result. That is fixed
now, but this table should be read together with that section rather than as a list of passing
checks.

Notes:
- `lint` runs eslint, the typechecks, and `prettier --check`. ⚠️ `prettier --check` covers
  `**/*.ts` only — `docs/**/*.md` is **not** in its scope, which is why the Markdown in this
  repository is not prettier-formatted and why several `.md` files here fail `prettier --check` when
  it is pointed at them by hand. That is pre-existing and is not a gate failure.
- `test-coverage` runs `vitest run --coverage` at the **S 78 / B 73 / F 70 / L 79** floors plus the
  nine per-path ratchets, then uploads the report as an artifact.
- The root `build` script builds `packages/shared-types` **first**, then the backend, then the
  frontend. The order matters: both consumers import the compiled package.


---

## Testing Best Practices

1. **Tests live next to the code.** `foo.service.ts` → `foo.service.spec.ts`.
2. ⛔ **A failing test pins a real defect — by failing, not by being excused.**
   This item previously described `it.fails` as the project's mechanism for recording a
   known-broken behaviour, and named two examples: the top-level-comments query
   (`eq(parentId, null)` where `isNull()` is required) and the story view-count cache invalidation.

   **Neither half of that survives contact with the repository.** `grep -rn "it.fails" backend`
   returns **0 hits** — `it.fails` is not used anywhere, so the practice described here did not
   exist. And the named example is worse: that query **was fixed**, at
   `comments.repository.ts:48` with `isNull(...)` (commit `01134dd`), and the fixed behaviour is
   pinned by two ordinary passing tests — `comments.repository.spec.ts:111` and
   `backend/test/comments.integration-spec.ts:50`. **Three separate documents** carried that example
   forward as an open defect pinned by an `it.fails` that did not exist. A fabricated `it.fails` is
   worse than no pin at all: it reads as evidence and is not.

   The corrected practice: a known defect is pinned by a **normal failing test** in the suite that
   owns it, or by a written record. If the suite skips instead, the defect is unpinned — and in CI
   output a skipped suite and a passing one look the same, which is precisely what happened here for
   months.
3. **No `TRUNCATE` in e2e.** Use the cloned-template mechanism.
4. **Coverage is a ratchet, not a goal.** The floors are the measured value minus a small margin.
   Raise a floor only when the code beneath it is genuinely covered.
5. **SWC metadata is mandatory in test configs.** Without it the `ValidationPipe` silently no-ops.
6. **Zod at the service boundary, `class-validator` at the pipe.** A Zod schema in a `dto/` file is
   invisible to the global `ValidationPipe`; parse it explicitly with `parseOrThrow()`.
7. **A skipped suite is not a passing suite.** Assert an expected test count, or at minimum fail a run
   in which every file skipped. See the section at the top of this document.

---

## Changelog — reconciliation

### Round 2 — 2026-10-04, the re-measurement

Every figure in the 2026-09-30 pass below was wrong. This round corrected the numbers **and** added
the section at the top of this document, which is the substantive finding: the DB-backed suite had
been skipping rather than running, so the green result it reported was not a result.

| Previous claim (2026-09-30) | Reality (2026-10-04) |
|---|---|
| Backend unit **104 files / 1792 tests** | **151 files / 3228 tests.** `find backend/src backend/test -name "*.spec.ts" -not -path "*/e2e/*"` |
| Backend e2e **23 files / 146 tests (+1 `it.fails` pin)** | **23 files / 173 tests, 0 skipped.** ⛔ **There is no `it.fails` in this repository** — `grep -rn "it.fails" backend` returns 0 hits. The pin was fabricated and is deleted, not rephrased |
| Frontend **21 files / 340 tests** | **22 files / 356 tests** |
| "plus 2 Playwright suites", backend Playwright **1 file / 10 tests**, frontend **2 files** | **One** Playwright suite: `frontend/playwright.config.ts`, **3 files / 15 tests**. ⛔ `backend/playwright.config.ts` **does not exist** — the backend browser suite and its config were deleted, as this document's own *Running the Suites* section already said. The table contradicted it |
| "Total: 2192 non-browser tests, plus two Playwright suites" | **3757 non-browser tests** plus one Playwright suite of 15 |
| Backend coverage **S 85.43 / B 82.39 / F 79.00 / L 85.58** | **S 84.28 / B 80.49 / F 78.86 / L 84.45.** Every previously reported metric was **higher** than the truth. A third set (L 86.52 / S 86.33 / B 83.31 / F 79.74) sat in the `backend/vitest.config.ts` comment; all three were wrong |
| Backend floors "78/70/73/79" | **S 78 / B 73 / F 70 / L 79.** Correct, but the earlier rendering transposed branches and functions |
| Frontend coverage **S 39.79 / B 35.90 / F 35.74 / L 40.22** | **S 40.75 / B 35.79 / F 39.64 / L 41.25** |
| "**Every** frontend metric has gone down" (from S 44.25 / B 87.05 / F 53.69 / L 44.25) | ⛔ **The premise was never measured.** A branches value of 87.05 against a 40.75 measurement is not a decline. The floors were also moved, to 38/33/33/38 |
| "10 jobs" | **11 jobs.** The list had 9 numbered rows under a "10 jobs" heading. `migration-roundtrip` and `test-browser` were both missing |
| "Supertest is a `@types`-only dependency and drives no test" | ⛔ **Wrong.** `supertest` ^7.0.0 is a real dependency; **46** files import it, **23 of them in the unit suite**. Only the narrower point stands — the *DB-backed* suite isolates by cloned database, not Supertest-against-one-database |
| "Two Vitest majors (backend 5.0.1, frontend 2.1.9)" | ⛔ **Obsolete.** Both workspaces declare `vitest@^5.0.3` and `@vitest/coverage-v8@^5.0.3`. The resolution trap no longer exists |
| Backend layout: "**104** unit test files", "**12** guard/module e2e files", "**11** DB-backed integration files", `backend/e2e/` holding two Playwright specs | **151 / 11 / 12** respectively, and **there is no `backend/e2e/`** — the browser specs are in `frontend/e2e/`, where `testDir: "./e2e"` points |
| Required services "PostgreSQL on 5432 and Valkey on 6379" | Defaults unchanged, but **overridable** via `TEST_DB_PORT` / `TEST_DB_HOST` / `TEST_DB_USER` / `TEST_DB_PASSWORD`, because a hardcoded 5432 made the suite unrunnable wherever that port was taken |
| Best Practice #2: "`it.fails` is used deliberately and sparsely to document a known-broken behaviour", naming the top-level-comments query | ⛔ **Deleted.** `it.fails` is used nowhere. The named query is **fixed** at `comments.repository.ts:48` with `isNull(...)` and pinned by ordinary passing tests. Replaced with: a defect is pinned by a normal failing test, and a skipped suite is not a passing suite |
| — | **New, and the finding of this round:** the backend could not boot and the whole DB-backed suite skipped green — a `books`↔`library` circular dependency with no `forwardRef()`, and `contests.module.ts` importing `NotificationsModule` without listing it. Both fixed; then 8 never-executed tests failed and were fixed |

### Round 1 — 2026-09-30

These remain accurate as of that measurement.

| Previous claim | Reality |
|---|---|
| "Supertest for integration tests" | The suite uses **Vitest**. ⚠️ The accompanying claim that Supertest was `@types`-only and drove no test was **wrong** — see Round 2 above |
| `jest-e2e.json` | ⛔ No Jest in the repository |
| `src/test/e2e/*` layout | The real layout is `src/e2e/`, `src/modules/**/e2e/`, and `test/` |
| Test factories and `faker` fixtures | ⛔ `faker` is not a dependency. `backend/test/mocks/*.mock.ts` are hand-written fixtures; there is no factory pattern |
| `npm run test:cov:check` (mentioned twice) | ⛔ Does not exist. Backend coverage runs inside `npm test`; frontend via `npm run test:coverage --workspace=frontend` |
| "CI pipeline with advisory thresholds" | **All gates are hard**, including `test-e2e`. ⚠️ The "10 jobs" count was wrong — see Round 2 |
| Coverage 80% (unspecified) | Backend is above its gate; the frontend is not, and its floors encode the current number rather than the target. ⚠️ The specific figures recorded here were wrong — see Round 2 |
| No test counts | Counts are now recorded, and are in Round 2 above |
| "Playwright for E2E" (implied API-only) | Real **browser** tests, with a `webServer` that boots the backend and the frontend; the frontend suite adds axe-core **WCAG 2.0/2.1 A+AA** checks. ⚠️ The backend half of this suite has since been deleted |
| E2E isolation unspecified | Per-test-file **cloned database** from a run-scoped template (~250ms vs 6.1s), `DROP ... WITH (FORCE)` teardown, 6h stale reaper, no `TRUNCATE` |
| — | **New:** Vitest 5 removed `test.transform`, so the old SWC transform was silently ignored and the global `ValidationPipe` validated **nothing** in the e2e suite. Fixed with a local `swcTypeScript()` Vite plugin. **Still true and still important** |
| — | **Superseded in Round 2:** the backend/frontend Vitest major split (5 vs 2) no longer exists |
| — | **New:** `src/modules/**/repositories/**` — 17 files unmeasured by choice, documented with the reason |
| — | **New:** the old `maxForks: 1` was dead in Vitest 5, so the e2e files were racing on one database; that was the intermittent-failure root cause |

---

*This document defines the testing strategy for Hakawi.*
