# Deliverables
## Hakawi Implementation Roadmap

Phase-wise deliverables, acceptance criteria, and ownership.

**Phase boundaries and status are canonical in
[`../phases/implementation-roadmap.md`](../phases/implementation-roadmap.md).** This document
previously used a different model (Phase 4 = weeks 9–11, Phase 5 = weeks 12–13, Phase 6 =
"Moderation & Polish, weeks 14–16") and carried a status block that contradicted it *and* the
reality. Both are fixed below.

Status markers: ✅ completed · 🔄 partial · ⛔ not built.

---

## Phase 1: Foundation (Weeks 1–2) — ✅ COMPLETE

#### 1.1 Project Setup ✅
- **Monorepo Structure**
  - Root `package.json` with npm workspaces
  - `backend/` (NestJS), `frontend/` (Next.js), `packages/shared-types/`
- **Backend Setup**
  - NestJS application, module structure, zod-validated env config
  - ESLint + Prettier configured
- **Frontend Setup**
  - ✅ **Next.js 16.3.5** with App Router — the previous version of this document said **Next.js 14**
  - ✅ Tailwind CSS 4
  - ❌ ~~Shadcn UI installed~~ → **Shadcn and Radix are NOT installed.**
    `frontend/src/components/ui/` is **5 hand-written components** — `Button`, `Card`,
    `ErrorMessage`, `Input`, `Loading` — plus `components/story/StoryMeta.tsx`. There is no
    `components.json` and no `@radix-ui/*` dependency
  - TanStack Query configured
- **Docker Setup**
  - ✅ `docker-compose.yml` at the repo root (PostgreSQL, Valkey, Adminer)
  - ✅ **`Dockerfile` exists at the repo root** (multi-stage build). `.github/workflows/deploy.yml`
    builds and pushes images to ghcr.io, but it references `./backend/Dockerfile` and
    `./frontend/Dockerfile` which do not exist

### Acceptance Criteria — met
- [x] `npm install` runs successfully at the root
- [x] Backend starts on port **3001**
- [x] Frontend starts on port **3000**
- [x] Database connects successfully
- [x] Valkey connects successfully

### Owner
- Backend: Backend Team
- Frontend: Frontend Team
- DevOps: DevOps Team

---

## Phase 2: Core Domain (Weeks 3–5) — ✅ COMPLETE

#### 2.1 Users Module ✅
- User registration (email/password) + OAuth (Google, Apple, Facebook, GitHub, TikTok)
- User CRUD — ✅ **including `POST /api/v1/users` and `DELETE /api/v1/users/:id`**, which were
  open roadmap items
- User profile management and statistics
- Verification workflow — ✅ **the `isVerified` write path now exists**
  (`backend/src/modules/users/events/users.event-handler.ts:53`)

#### 2.2 Stories Module ✅
- Story CRUD operations
- Story publishing workflow
- Sanity CMS integration
- Story categories and tags
- View tracking — a `view_count` column, not a `story_views` table. ⚠️ **the column was never written
  over HTTP**: `incrementViewCount` existed in the service with **no route**, so the counter was
  structurally always zero. `POST /api/v1/stories/:id/view` is now the only HTTP writer of it — any
  authenticated reader, `@ThrottleTier('search')`, **204**. Its cache invalidation was split so one
  page view no longer sweeps the whole `search` cache tag

#### 2.3 Search Module ✅
- Full-text search for stories (PostgreSQL FTS + GIN expression indexes)
- Author, category and tag search
- Result pagination
- ✅ Validated by a real `SearchFiltersDto` **class** — the DTO was a Zod schema before and the
  global `ValidationPipe` silently skipped it
- ✅ `sortBy: 'relevance'` is **implemented** — it was documented and defaulted but **never coded**
  (no `ts_rank` anywhere in the repository), so "relevance" silently meant creation date. It is now
  real `ts_rank_cd` over the existing `0014` GIN expression, with `created_at DESC` as tiebreaker
- ⚠️ **`sortBy` was missing from the search cache key**, so `?sortBy=views` and `?sortBy=date` shared
  one cache entry. Now in `buildSearchCacheKey`
- ⚠️ **Every search from the web client was a 400.** `frontend/src/lib/api.ts` sent `q=`; the DTO field
  is **`query`** and `forbidNonWhitelisted` is on, so the UI reported "no results" for every query.
  Fixed at `frontend/src/lib/api.ts:571-574`

#### 2.4 Stories visibility ✅ (security, corrected 2026-10-04)
- ⚠️ `GET /api/v1/stories` is `@Public()` and forwarded `status` unfiltered — an **anonymous dump of
  every draft**. Fixed: `status` is pinned to `published`, and `StoriesQueryDto.status` is `@IsIn`
  validated so a typo is a 400
- ⚠️ `GET /stories/:id` and `GET /stories/slug/:slug` were also `@Public()` and returned drafts and
  archived stories. Fixed with a new `OptionalJwtAuthGuard`: an unpublished story is readable only by
  its author or a `Permission.CONTENT_MODERATE` holder; everyone else gets **404, not 403**
- ✅ An unusable credential on a public route is treated as **anonymous**, not 401 — this client
  authenticates on a 15-minute httpOnly cookie, and a 401 would sign a reader out mid-read
- ⛔ No authenticated route lists an author's own drafts, and no route lets the owner fetch
  `POST /stories/:id/view` on an archived story

### Acceptance Criteria — met
- [x] Users can register and login
- [x] Users can update their profile
- [x] Writers can create stories
- [x] Stories can be published
- [x] Published stories are searchable
- [x] Search returns relevant results

### Owner
- Backend: Backend Team
- Frontend: Frontend Team

---

## Phase 3: Social Features (Weeks 6–7) — ✅ COMPLETE

#### 3.1 Interactions Module ✅
- Follow/unfollow system — `POST /api/v1/follows`, `DELETE /api/v1/follows/:followingId`,
  `GET /api/v1/follows/user/:userId/followers|following`, `GET /api/v1/follows/check/:followingId`
- Story reactions — `POST|DELETE /api/v1/reactions/stories/:storyId` `{type}`,
  `GET /api/v1/reactions/stories/:storyId/counts`
- Comments with nested replies — `GET /api/v1/comments/story/:storyId`,
  `GET /api/v1/comments/:id/replies`, `POST /api/v1/comments` `{storyId, content, parentId?}`,
  `PATCH|DELETE /api/v1/comments/:id`, `POST /api/v1/comments/:commentId/reactions`
- ⛔ **The web client could not reach any of this.** `frontend/src/lib/api.ts` called
  `/users/:id/follow`, `/stories/:id/reactions` and `/stories/:id/comments` — **none of which is
  declared by any controller** — so every follow, react and comment from the browser was a **404**.
  **Twelve call sites** are corrected to the routes above, pinned by
  `frontend/src/lib/api.contract.test.ts` against the backend controller that declares each one.
  ✅ **The social UI pages are now functional read-only server components** — `comments/page.tsx`
  calls `api.getComments(id)`, `reactions/page.tsx` calls `api.getReactions(id)`,
  `followers/page.tsx` calls `api.getFollowers(id)`, and `following/page.tsx` calls
  `api.getFollowing(id)`. The client methods are correct and pinned, and each view invokes its
  corresponding method. ⚠️ **Two of the four pages lack navigation call sites**: `/stories/[id]/comments` and `/stories/[id]/reactions` are not linked from any main page or navigation element, so users cannot reach them through the product UI
- ⛔ **A contest winner receives two notifications for winning and two for the prize.**
  `contests.event-handler.ts:129,151,168` and `notifications.event-handler.ts:96,113` both subscribe
  to `winner.selected`, `contest.started` and `prize.distributed`. Recorded, not fixed: one side must be
  declared canonical

#### 3.2 Notifications Module ✅
- In-app notifications — `GET /api/v1/notifications`, `GET /notifications/unread-count`,
  `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`
- ⚠️ **Duplicate routes are removed.** `GET /notifications/unread/count` shadowed `unread-count`, and
  `PUT /notifications/read-all` sat beside `PATCH /notifications/read-all`. Two spellings of one action
  is the same defect as two copies of one map
- Notification preferences — resolved through **one** map,
  `backend/src/modules/notifications/preference-family.ts`. ⚠️ comment reactions were previously written
  as `type: 'story_reaction'`, so a reaction to a **comment** resolved to the **story-reaction**
  preference: muting comments did not stop them and muting stories stopped comments. The type is now
  **`comment_reaction`**
- ⛔ **Email notifications — NOT BUILT.** The `EMAIL_*` variables are documented and
  `EMAIL_FROM` is read by `backend/src/modules/notifications/email/notifications-email.service.ts:21`, but **no SMTP client is wired**;
  the module emits events
- ⛔ Push notifications — future, as stated

#### 3.3 Messages Module ✅
- Direct messaging
- Conversation list
- Message history
- Read receipts — `is_read` / `read_at` on `messages`. ⚠️ the route was
  `PATCH /messages/messages/:messageId/read` — a **doubled path segment** under `@Controller('messages')`
  that never matched, so read receipts were unmarkable over HTTP. Now `PATCH /messages/:messageId/read`
  (`messages.controller.ts:125`)
- ✅ **The follow/react/comment/message → notification write path is now tested** —
  `backend/test/notifications.phase3.integration-spec.ts`, **11 cases**. It previously had **no test at
  all**, and could not have had one: the integration suite had never executed

### Acceptance Criteria — met
- [x] Users can follow/unfollow
- [x] Users can react to stories
- [x] Users can comment on stories
- [x] Users receive notifications
- [x] Users can send messages
- [x] Notifications are marked as read

### Owner
- Backend: Backend Team
- Frontend: Frontend Team

---

## Phase 4: Books & Commerce (Weeks 8–10) — ✅ COMPLETE

#### 4.1 Books Module ✅
- Book CRUD operations
- PDF upload (S3 presigned URLs)
- Book details endpoint
- Book catalog

#### 4.2 Sales System ✅
- Book purchase flow — `POST /api/v1/books/:id/purchase`
- ✅ **Paymob integration is real.** `PaymobClient` runs the full flow through
  `ResilientHttpClient` with Zod on every response: auth token (Valkey-cached) → order
  registration → payment key → iframe/accept URL → refund. **The previous version of this
  document implied a stub; the old stub fabricated a URL with no HTTP call at all**
- Payment webhooks — `POST /api/v1/payments/webhooks/paymob`
- Transaction history — `payment_transactions`

#### 4.3 Rental System ✅
- Book rental flow — `POST /api/v1/books/:id/rent`
- Rental durations — `duration_days` is an **integer** constrained by
  `@IsIn([1, 3, 7, 14, 30, 90])` in `RentBookDto`. An enumeration, but expressed as a
  class-validator constraint rather than a `rental_duration` `CREATE TYPE` enum
- Rental extensions — `rental_extensions`
- User library — `library`

#### 4.4 Payments Module ✅
- Payment processing
- Webhook handling, idempotent via `uniqueIndex` on `payments.paymob_transaction_id`
- Refund processing — `POST /api/v1/payments/:id/refund`
- ✅ Gateway fields persisted: `paymob_payment_key`, `paymob_iframe_url`, `paymob_accept_url`
  (migration `0016_add_paymob_gateway_fields.sql`)
- ⛔ Revenue tracking — no revenue dashboard or report exists
- ⛔ **No live-sandbox verification.** Sandbox vs live is selected by `PAYMOB_ENVIRONMENT` (which
  swaps the credential set) — **not** by the base URL, which is `https://accept.paymob.com/api`
  in both modes

### Acceptance Criteria — met
- [x] Authors can create books
- [x] Users can purchase books
- [x] Payments process successfully
- [x] Users can rent books
- [x] Rentals expire correctly
- [x] Library shows purchased/rented books

### Owner
- Backend: Backend Team
- Frontend: Frontend Team
- Payments: Payments Team

---

## Phase 5: Contests (Weeks 11–12) — ✅ COMPLETE

#### 5.1 Contest Management ✅
- Contest creation and lifecycle (draft → active → voting → completed) —
  `POST /:id/start`, `/cancel`, `/complete`
- Submission system with approve/reject
- Word-count validation ⚠️ (partial — no dedicated column or check constraint was found)

#### 5.2 Voting System ✅
- Community voting — `contest_votes`
- Vote counting
- Vote limits

#### 5.3 Winner Selection ✅
- Publisher selects winner — `POST /api/v1/contests/:id/winner`
- ✅ **Badge awarding — BUILT.** The `badges` module, `badges` / `user_badges` tables (migration
  `0013`), award logic, and `GET /api/v1/badges`. This was an open roadmap item
- Prize distribution — `contest_prizes`
- Winner notifications

### Acceptance Criteria — met
- [x] Publishers can create contests
- [x] Authors can submit stories
- [x] Community can vote
- [x] Winners can be selected
- [x] Prizes are distributed
- [x] Winners receive badges

### Owner
- Backend: Backend Team
- Frontend: Frontend Team

---

## Phase 6: Moderation (Week 13) — ✅ COMPLETE

#### 6.1 Moderation System ✅
- Reporting system — `reports.source` distinguishes user-filed from auto-filed (migration `0018`)
- Auto-escalation — called on report creation and swept by `escalation.scheduler.ts`
- Moderation actions — `moderation_actions`
- User restrictions — `user_restrictions` + `RestrictionGuard`
- Admin dashboard — `/moderation/stats`, `/reports/trends`, `/actions`, `/users/:id/restrictions`
- ✅ **The authorization hole is closed.** `@RequireAdminRole` was dead metadata with no
  `RolesGuard` applied, so any authenticated user could read moderation stats. `@Secured()` now
  wires `JwtAuthGuard` + `RestrictionGuard` + `RolesGuard` + `PermissionsGuard`.
- ✅ **The dead restriction control is closed.** `RestrictionGuard` was in neither
  `CommonModule.providers` nor its exports and was applied to zero routes, while six documents
  described it as live — so a moderation `ban` had no effect on the API. It is now provided,
  exported, composed into `SECURED_GUARDS`, and pinned by `restriction-guard.wiring.spec.ts`, which
  drives real HTTP and asserts a banned account is refused. Its logic was also wrong in a way that
  would have shipped: the producer wrote the **raw** action for all five of
  `warn`/`mute`/`ban`/`content_removal`/`no_action`, so wiring the guard as written would have turned
  every warning and every no-op decision into a total account lockout

#### 6.2 Testing ✅ (with a gap)
- ✅ Unit tests: **151 files / 3228 tests**. Re-derive with `npm test --workspace=backend`. ⚠️ the
  number was previously recorded as 145/3047 and as 104/1792; both were wrong, and this row had
  drifted twice without anyone re-running the suite
- ✅ Integration/e2e: **22 files / 186 tests** — 10 `src/modules/**/e2e/*.e2e-spec.ts`,
  `backend/test/app.e2e-spec.ts`, and **11** `backend/test/*.integration-spec.ts`, per-file cloned
  database. Selected by `vitest.config.e2e.ts`; needs a live PostgreSQL and Valkey
  - ⚠️ **and it now actually executes.** Until this change set **every one of those files was skipping
    itself**: `BooksModule` ↔ `LibraryModule` had no `forwardRef()`, Nest aborted the module graph
    (`The module at index [3] of the LibraryModule "imports" array is undefined`), and the backend could
    not start — on a repository whose integration tests never executed. The `test-e2e` job exits 1
> (it is red, not green), but the tests report as **skipped**, not failed. Fixed
    on both sides (`books.module.ts:33`, `library.module.ts:24`). With the graph building, **8
    previously-never-executed tests failed** on stale fixtures and were fixed. The previous row also said
    "10 `test/*.integration-spec.ts`"; there are **11**
- ✅ E2E browser tests: **3 files / 15 tests** in `frontend/e2e/` (`journeys`, `api-critical-paths`,
  `accessibility`), driven by `frontend/playwright.config.ts`, which boots both servers itself. Plus
  `@axe-core/playwright` on the frontend. ⚠️ the document previously said **2 files / 9 tests** and
  "real browser tests in `backend/` and `frontend/`". There is **no backend browser suite**:
  `backend/playwright.config.ts` and `backend/e2e/critical-flows.e2e-spec.ts` were both orphaned
  (excluded by both vitest configs, invoked by no CI step) and have been deleted — the five API tests
  they held moved to `frontend/e2e/api-critical-paths.e2e-spec.ts`, which `test-browser` does run
- ✅ Frontend tests: **62 files / 794 tests**. ⚠️ previously recorded as 21/340 and as 22/356 with the
  note "unchanged — this figure was already correct". It was not
- ✅ Backend coverage: **S 84.28 / B 80.49 / F 78.86 / L 84.45**, against global floors of
  **78 / 73 / 70 / 79** plus **9** per-path ratchets (`backend/vitest.config.ts`). ⚠️ this row previously
  published S 85.43 / B 82.39 / F 79.00 / L 85.58 — **all four were wrong**. Derive from
  `backend/coverage/coverage-summary.json`
- ⚠️ Frontend coverage: **S 68.39 / B 68.75 / F 70.97 / L 68.17**, against an 80% target. ⚠️ the previous
  S 39.79 / B 35.90 / F 35.74 / L 40.22 — **all four were wrong**. The gate in `frontend/vitest.config.ts`
  is set to **38 / 33 / 33 / 38**, so CI passes at roughly 68%: the gate encodes the current number
  rather than the target
- ⛔ **Performance tests — NOT BUILT.** No k6 / Locust / autocannon / Artillery config

#### 6.3 Documentation ✅ / 🔄
- ✅ API documentation — OpenAPI served at `/api/docs` and `/api/docs-json`. ⚠️ enabled by
  default including in production (`ENABLE_SWAGGER !== 'false'`), so an operator who forgets the
  variable publishes the full API map, admin routes included
- ✅ Deployment guides
- ✅ Architecture docs
- ⛔ **User documentation — NOT BUILT**

#### 6.4 Deployment 🔄
- [ ] Staging deployment — ⛔ no artifact
- [ ] 🔄 Production deployment — deploy workflow exists (`.github/workflows/deploy.yml`) and
  per-service Dockerfiles now exist (`./backend/Dockerfile`, `./frontend/Dockerfile`), but there is no
  staging/production manifest or IaC
- [x] Monitoring setup — `@sentry/nestjs@11.1.0`, `common/observability/sentry.config.ts`
- [x] CI/CD pipeline — **12 jobs** (`lint`, `test-unit`, `test-frontend`, `test-coverage`,
  `test-e2e`, `test-browser`, `migration-premerge`, `migration-verify`, `migration-roundtrip`,
  `security`, `build`, `load-test`). ⚠️ the document previously said **10** and omitted
  `migration-roundtrip` — which is the only job that ever runs the down scripts, and which `build`
  **does** depend on. ⚠️ `migration-verify` is gated on a push to `main`, so on a pull request it
  reports **skipped**; and `build`'s `needs:` omits it, so a green `build` does not prove the
  from-scratch migration chain applied

### Acceptance Criteria
- [x] Users can report content
- [x] Moderators can take action
- [x] All tests pass
- [ ] Performance meets targets — ⛔ never measured
- [ ] Security audit passed — 🔄 CI `npm audit` only; no pentest
- [ ] Production deployed — ⛔
- [ ] Monitoring configured — 🔄 Sentry wired, no dashboards, no alert rules

### Owner
- Backend: Backend Team
- Frontend: Frontend Team
- DevOps: DevOps Team
- QA: QA Team

---

## Phase 7: Polish & Launch (Weeks 14–18) — 🔄 IN PROGRESS

Delivered early, during Phases 1–2:
- ✅ Event schema registry, DLQ, event versioning, event validation
- ✅ Circuit breakers, retry with backoff, timeout, fallback — **wired, not dead code**

Still open:
- ⛔ Read replicas, read/write splitting, replication-lag monitoring
- 🔄 Load testing — automated in CI via k6 (`load-tests/k6.conf.js`, `load-test` job on push to main)
- 🔄 Production `Dockerfile`s exist at repo root, `backend/`, and `frontend/`; deploy workflow exists but
  there is no staging/production manifest or IaC
- ⛔ Staging and production deployment
- 🔄 Backup automation — `.github/workflows/backup.yml` runs `pg_dump` daily at 2 AM UTC and uploads
  as an artifact; no PITR
- ⛔ Alerting rules
- ⛔ Security penetration testing
- ⛔ User documentation

See the full list in
[`../phases/implementation-roadmap.md`](../phases/implementation-roadmap.md#open-items--the-complete-list-of-⛔-work).

---

## Deliverable Tracking

### Status Legend
- ✅ Completed
- 🔄 Partially completed
- ⛔ Not built
- ❌ Blocked

### Current Status — reconciled 2026-10-04

| Phase | Status |
|---|---|
| Phase 1 (Foundation) | ✅ Complete |
| Phase 2 (Core Domain) | ✅ Complete |
| Phase 3 (Social Features) | ✅ Complete |
| Phase 4 (Books & Commerce) | ✅ Complete |
| Phase 5 (Contests) | ✅ Complete |
| Phase 6 (Moderation) | ✅ Complete |
| Phase 7 (Polish & Launch) | 🔄 In progress |

**Previously this block said:** Phase 1–3 ✅, Phase 4 🔄, Phase 5–6 ⏳ Not Started. That was wrong
in both directions — Phases 4, 5 and 6 shipped, and Phase 7's event-schema-registry, DLQ and
resilience work shipped early. `phases/implementation-roadmap.md` had the opposite error: every
checkbox, including Phases 1–3, was unchecked. Both documents are now derived from the same
canonical status table.

### Review Process
1. Weekly review of deliverables
2. Update status in this tracking section
3. Identify blockers early
4. Adjust timeline if needed

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality | Evidence |
|---|---|---|
| "Next.js 14 with App Router" | **Next.js 16.3.5** | `frontend/package.json` → `"next": "16.3.5"` |
| "Shadcn UI installed" | ⛔ **Not installed.** 5 hand-written components + `StoryMeta`; no `@radix-ui/*`, no `components.json` | `frontend/src/components/ui/`, `frontend/package.json` |
| Phase 4 = weeks 9–11 | **8–10** (canonical) | `phases/implementation-roadmap.md` |
| Phase 5 = weeks 12–13 | **11–12** (canonical) | same |
| Phase 6 = "Moderation & Polish, weeks 14–16" | **Moderation is week 13 and complete**; Polish & Launch is weeks 14–18 and in progress | same |
| "Phase 5 (Contests): ⏳ Not Started" | ✅ Complete, including the badges module | `backend/src/modules/badges/`, `migrations/0013_create_badges_tables.sql` |
| "Phase 6 (Moderation & Polish): ⏳ Not Started" | Moderation ✅ complete; Polish 🔄 in progress | same |
| "Phase 4: 🔄 In Progress" | ✅ Complete | same |
| "Docker Compose … PostgreSQL / Valkey / Adminer" ✅ | ✅ correct, but ⚠️ **no `Dockerfile` exists**, so the app is not containerised | `find . -name Dockerfile*` → empty |
| Phase 2 "Verification workflow" | ✅ correct, and the `isVerified` **write path** now exists | `backend/src/modules/users/events/users.event-handler.ts:53` |
| — | **New:** `POST /users` and `DELETE /users/:id` now exist, closing the old "CRUD-minus-create-and-delete" gap | `users.controller.ts:87,118` |
| — | **New:** `SearchFiltersDto` is a real class again; it was a Zod type alias the global `ValidationPipe` silently skipped | `backend/src/modules/search/dto/search.dto.ts` |
| — | **New:** Paymob is a real client; the doc implied a stub | `backend/src/modules/payments/clients/paymob.client.ts` |
| — | **New:** `PAYMOB_ENVIRONMENT` selects the credential set, **not** the base URL | `backend/src/config/paymob.config.ts:52-55` |
| — | **New:** no email delivery; only `EMAIL_FROM` is read | `backend/src/modules/notifications/email/notifications-email.service.ts:21` |

---

## Changelog — reconciliation (2026-10-04)

§6.2 is the section this pass rewrote, because it is the section a reader is most likely to trust and
it was the furthest from the code. Every number below was re-derived by running the suite or reading
the coverage artefact, not by editing the previous number.

| Previous | Reality | Evidence |
|---|---|---|
| **145 files / 3047 unit tests** (and, two revisions earlier, 104 / 1792) | **151 files / 3270** | `npm test --workspace=backend` → `Test Files 151 passed (151)` / `Tests 3270 passed (3270)` |
| **22 files / 136** e2e + integration | **22 files / 186** | `npm run test:e2e --workspace=backend`; file breakdown 10 + 1 + **11** |
| …and "10 `test/*.integration-spec.ts`" | **11**. The previous 11 + 1 + 10 summed to the 22 it reported, so the total was self-consistent and still wrong | `ls -1 backend/test/*.integration-spec.ts \| wc -l` → 11 |
| The integration suite presented as a passing green gate | ⛔ **it had never executed.** `BooksModule` ↔ `LibraryModule` had no `forwardRef()`, Nest aborted the graph, and **all 11 integration specs skipped instead of running**. **Measured correction.** An earlier draft of this note said the outage left "CI green".
That was asserted without measuring the exit code, and it is wrong: `npm run test:e2e
--workspace=backend` exits **1** in the broken state, so the `test-e2e` job is **red**. What is true
is narrower and still serious: every test in the affected files was reported **skipped** rather than
failed, so the per-test summary read "195 skipped" and not "195 failed", and the documentation
recorded the suite as green. The masking is in the *reporting*, not in the exit code. Fixed on both sides; **8 never-run tests then failed** on stale fixtures and were fixed | `books.module.ts:33`, `library.module.ts:24` |
| **2 files / 9** Playwright tests, and "browser tests in `backend/` and `frontend/`" | **3 files / 15**, frontend only. `backend/playwright.config.ts` is deleted | `ls frontend/e2e/` → 3 files; 4 + 6 + 5 `test(` calls |
| **21 files / 340** frontend tests, annotated "unchanged — this figure was already correct" | **62 files / 794** | `npm run test:run --workspace=frontend` |
| Frontend coverage **S 39.79 / B 35.90 / F 35.74 / L 40.22** | **S 68.39 / B 68.75 / F 70.97 / L 68.17** — **all four were wrong** | `frontend/coverage/coverage-summary.json` |
| *(backend coverage was never stated in this file)* | Added: **S 84.28 / B 80.49 / F 78.86 / L 84.45**, against floors 78/73/70/79 + 9 ratchets. The quadruples published elsewhere in the roadmap — 85.43/82.39/79.00/85.58 — were **all four wrong** | `backend/coverage/coverage-summary.json`, `backend/vitest.config.ts` |
| CI/CD pipeline — **10 jobs** | **12**: `migration-roundtrip` and `load-test` were missing from the list, and `migration-roundtrip` is in `build`'s `needs:` | `awk '/^jobs:/{f=1;next} f&&/^  [a-z-]+:/{print}' .github/workflows/ci.yml` |
| §2.2 "View tracking" listed as delivered | ⛔ **it was not.** `view_count` had **no HTTP writer at all**; `POST /stories/:id/view` now exists (204, `@ThrottleTier('search')`) and its cache invalidation was split so a page view no longer evicts every cached search | `stories.controller.ts:265` |
| §2.3 search listed as delivered | 🔄 **partly not.** `sortBy: 'relevance'` was never implemented; `sortBy` was absent from the cache key; and every web-client search was a 400 on `q=` vs `query` | `search.repository.ts:113`, `cache-keys.ts`, `frontend/src/lib/api.ts:571` |
| §3.1–3.3 social features listed as delivered | ⚠️ **the web client could not reach any of them** — `/users/:id/follow`, `/stories/:id/reactions` and `/stories/:id/comments` are declared by no controller, so 12 call sites were 404s. Real routes now listed. ⛔ **the UI pages still have no call sites** | `frontend/src/lib/api.contract.test.ts` |
| §3.3 read receipts listed as delivered | ⚠️ the route had a **doubled path segment** and never matched. Now `PATCH /messages/:messageId/read` | `messages.controller.ts:125` |
| §3.2 preferences listed as delivered without a mapping | ⚠️ comment reactions were written as `type: 'story_reaction'`, so muting comments did not stop them. One authoritative map in `preference-family.ts` | `notifications/preference-family.ts` |
| — | **New ⛔:** duplicated contest notifications — two handlers subscribe to `winner.selected` and `prize.distributed` | `contests.event-handler.ts:129`, `notifications.event-handler.ts:96` |
| — | **New ✅:** the follow/react/comment/message → notification write path had **no test at all**; `backend/test/notifications.phase3.integration-spec.ts` adds **11** cases | that file |
| — | **New §2.4:** the stories-visibility security corrections, including the deliberate anonymous-not-401 decision and the two ⛔ gaps it leaves | `stories.controller.ts:37-118`, `optional-jwt-auth.guard.ts` |

---

*This document defines deliverables for the Hakawi implementation.*
