# ADR 006 — The backend could not boot, and every affected test reported itself as "skipped"

- **Status:** Accepted
- **Date:** 2026-10-04
- **Supersedes:** nothing
- **Related:** `docs/01_ARCHITECTURE_PRINCIPLES.md`, `docs/testing/testing-strategy.md`,
  `docs/roadmap/phases/implementation-roadmap.md`, ADR 005

## Context

A documentation-conformance audit was commissioned for Phases 1–3: does the product match what
`docs/roadmap/` claims? The expected answer was "mostly, with some stale numbers".

It was not that. Three defects were found that sit underneath the roadmap's central claim — that
Phases 1–6 are complete and tested:

1. **The NestJS application could not start.** `books.module.ts` imported `LibraryModule` while
   `library.module.ts` imported `BooksModule`, with no `forwardRef()` on either side. One of the two
   classes evaluated to `undefined` at import time and Nest aborted the entire module graph:

   ```
   Nest cannot create the LibraryModule instance.
   The module at index [3] of the LibraryModule "imports" array is undefined.
   ```

   Separately, `contests.module.ts` **imported** `NotificationsModule` but never listed it in the
   `@Module({ imports })` array, so `ContestsEventHandler` could not resolve `NotificationsService`:

   ```
   Nest can't resolve dependencies of the ContestsEventHandler
   (Symbol(CONTESTS_REPOSITORY), ?, WinstonLoggerService)
   ```

2. **The entire DB-backed test suite reported itself as *skipped* rather than failed.** Both failures
   happen in `DependenciesScanner.scanForModules` — *before any test body runs*. So `beforeAll`
   threw, and every test in the affected file was tallied as **skipped, not failed**. Eleven
   `*.integration-spec.ts` files plus the stories e2e file had never executed a single assertion.

   **Correction, recorded because the first draft of this ADR got it wrong.** That draft claimed CI
   "stayed green" and that the job "exited 0". Both were asserted without measuring the exit code.
   Measured, with the cycle reintroduced: `npm run test:e2e --workspace=backend` exits **1**, so the
   `test-e2e` job is **red**. The claim was wrong twice over — it was invented, and it was the more
   comfortable version, because "the pipeline was green over an app that could not boot" is a
   cleaner story than "the pipeline was red and nobody ran it, and the documentation said green
   anyway".

   What survives is narrower and still worth acting on: the *per-test* summary read **"195 skipped,
   0 failed"**, which reads like a suite with nothing left to do rather than a suite that never ran.
   That is the reporting defect, and it is what let the state be written down as passing.

3. **With the graph building, 8 of those tests failed immediately** — stale fixtures for routes
   that had been changed months earlier.

The roadmap's own text is the reason this needs writing down. `implementation-roadmap.md` stated,
as verified fact, "3523 tests across three suites, all green, with a hard CI gate and a per-file
cloned test database", and an audit had already certified the coverage floors and the ten-job
pipeline. Every one of those statements was accurate about *what was configured* and wrong about
*what had run* — and the "all green" part was not derived from a run at all.

## Why the documentation was wrong in the direction it was

Across the five roadmap documents, the errors were not random. They leaned one way:

- Test and coverage figures were **inflated** — 145 unit spec files against the 148 the tree actually
  held at audit time, and 3047 tests against a figure no command could reproduce.
- A defect that had been **fixed** was still reported as open — the `parent_id = NULL` comment bug,
  cited four times across three documents, including a claim that *"the pinned test is `it.fails`"*
  when no `it.fails` exists anywhere in the repository.
- A defect that was **live** was reported as closed — "the DLQ has no drain; a dead-lettered event is
  never redelivered", describing code that had since been replaced.
- Real functional breakage was certified as delivered: the web client's follow / react / comment
  calls, and the search request, all addressed routes that do not exist.

A previous audit pass had added file:line citations and commands to make claims checkable. That
raised confidence without raising accuracy, because **the citations were not verified** — one cited a
backwards line range (`app.controller.ts:31-27`) as the evidence for a milestone exit criterion, and
several pointed at lines that had moved.

## Decision

Treat the roadmap's status column as unverified until a command in this repository reproduces it.

Concretely, this change set:

**Fixed the two launch blockers.** `forwardRef()` on both sides of the books/library cycle;
`NotificationsModule` added to `ContestsModule`'s imports. The cycle was not broken by deleting an
import — each module genuinely needs the other's exported repository token (books asks whether the
reader already owns the book before charging; library asks whether a claimed book is `is_free`), so
`forwardRef` is the correct tool and the reasoning is in a comment on both files.

**Made the e2e harness datastore overridable** (`TEST_DB_PORT` and friends). The port was hardcoded,
so the suite was unrunnable on any machine where 5432 was already claimed — including this one.

**Fixed the 8 newly-visible failures** by deciding, per test, whether the *test* or the *production
code* was wrong. Six were stale fixtures. One targeted `POST /library`, a route deliberately deleted
because it let any authenticated account claim any book for free; it was rewritten against
`POST /library/claim` and now asserts the deleted route stays 404. One asserted that a draft appears
in the public story list — it was pinning the leak described below, and was inverted.

**Closed two authorization holes** (Phase 2). `GET /api/v1/stories` is `@Public()` and forwarded
`status` unfiltered, so `?status=draft` was an anonymous dump of every unpublished story in the
system. `GET /stories/:id` and `GET /stories/slug/:slug` were also `@Public()` and returned drafts and
archived stories by both keys. The list is now pinned to `published`; the detail routes resolve the
caller through a new `OptionalJwtAuthGuard` and serve an unpublished story only to its author or a
caller holding `Permission.CONTENT_MODERATE` — everyone else receives **404, not 403**, so the route
never confirms the work exists.

**Corrected the Phase 2 and Phase 3 correctness defects** the audit surfaced, including twelve
frontend call sites addressing non-existent routes, `sortBy: 'relevance'` documented and defaulted
but never implemented, `sortBy` absent from the search cache key, `view_count` with no write path, a
doubled `PATCH /messages/messages/:id/read`, duplicate notification routes, comment reactions
resolving to the wrong preference family, and an N+1 in reaction counts.

**Reconciled 33 documents** against measured output, and added a dated correction note to every
file whose numbers were wrong. `docs/testing/testing-strategy.md` now leads with the finding above.

## Three decisions worth arguing about

**An unusable credential on a public route is anonymous, not 401.** `OptionalJwtAuthGuard` was first
built to answer 401 for a token it could not verify, on the reasoning that authentication failure
should be reported as such. That was reverted. This client authenticates with an httpOnly
`access_token` cookie and never sets a header, and the cookie lives 15 minutes — so every reader who
browses past that boundary holds a stale one, and a 401 on a `@Public()` route reaches
`handleResponse`, which clears the stored user. The result was that an expired session denied
*anonymous* access to *published* content. The security property is unchanged either way: an
unverifiable claim is never honoured as an identity, so the caller gets exactly the anonymous
answer. `JwtAuthGuard` still returns 401 for the same token on any route that actually requires
authentication. The cost accepted is that an author whose token expired gets 404 on their own draft
instead of a prompt to refresh — one person re-authenticating, rather than every reader signing out.

**The detail-route fix required an extension, not a modification.** The tempting fix was to 404 every
unpublished story on the public route. That breaks the author's own draft editor, which reads
`GET /stories/${id}`, and it breaks publish. Rather than weaken `JwtAuthGuard` or make
`AuthRequest.user` optional — both of which would relax the type on every protected route — a new
guard and a new request interface were added, and the token-extraction logic both guards now share was
extracted once into `common/guards/access-token.ts`. The alternative, duplicating that logic, is
precisely the second-source-of-truth drift Principle #9 exists to prevent.

**The visibility rule lives in the service, and the cache cannot leak a draft.** The check sits beside
the existing `deletedAt` check in one helper, so the id and slug keys cannot drift. It runs on the
value `getOrSet` *returns*, not inside its `load`: a cache hit never calls `load`, so a check placed
there would run on cold reads only — the author's read would cache the draft and every later
anonymous read would be served warm with the rule never executed. A test warms the cache, asserts
the repository was not called, and still expects 404.

## Consequences

- Backend unit **151 files / 3270 tests**; e2e + integration **23 files / 199 tests, 0 skipped**;
  frontend **22 files / 356 tests**; Playwright **3 files / 15 tests**.
- Backend coverage **S 84.28 / B 80.49 / F 78.86 / L 84.45** against floors 78/73/70/79.
  Frontend **S 40.75 / B 35.79 / F 39.64 / L 41.25** against a gate set to 38/33/33/38 — still far
  below the 80% target, and the gate still encodes the current number rather than the target. That
  remains open.
- One migration was added: `0023_add_message_notification_preference`, a single additive column so a
  direct message can be muted at all. Classified `data-loss` on rollback, because every stored row
  holds a value a user chose and dropping the column erases that choice.
- **`test-e2e` now fails when the suite does not run.** `backend/scripts/assert-suite-ran.mjs` reads
  the Vitest JSON report and fails the job when the collected count is below a floor or any test was
  skipped. Verified by reintroducing the `forwardRef` removal: the guard reports
  `195 test(s) were skipped, expected at most 0` and exits 1.
- The duplicate contest notifications are **fixed**: the three notifications-side handlers for
  `contest.created`, `winner.selected` and `prize.distributed` were deleted, because the contests
  module — the owner — had already decided the behaviour in writing and the copies contradicted it.
  The first draft of this ADR called that "a product decision". It was not: the owner had already
  made the decision, so the copies were simply wrong. A test now pins the listener set so the
  duplicates cannot return.

## What this ADR got wrong the first time

Recorded because Principle #4 is about exactly this. Two claims in the first draft were asserted
without being measured:

1. **"CI stayed green" / "the job exited 0."** False. `npm run test:e2e --workspace=backend` exits
   **1** in the broken state. It was the more comfortable version of the story — "green pipeline over
   an app that cannot boot" is a tidier narrative than "red pipeline nobody ran, and green prose
   written anyway" — and it was the version I reached for without running the command.
2. **"No SQL migration was added."** True when written, false as a standing claim: `0023` was
   subsequently added to give direct messages a preference column.

Both were caught by the same discipline this change set applies to the roadmap: run the command,
quote the output, and do not narrate a number that was not produced by something. The rule now
adopted for documentation in this repository is that a claim about CI or coverage must be
reproducible by a command in the repository, or it does not get written down.