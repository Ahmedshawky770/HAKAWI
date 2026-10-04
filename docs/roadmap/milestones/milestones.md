# Milestones
## Hakawi Implementation Roadmap

Milestone criteria, verification steps, and exit conditions.

**Milestone weeks are canonical in [`../phases/implementation-roadmap.md`](../phases/implementation-roadmap.md).**
This document previously used a different, incompatible model (6 milestones ending week 16,
Phase 4 = weeks 9–11, Phase 5 = weeks 12–13). It now uses the same 8-milestone, 18-week model as
every other roadmap document.

Status markers: ✅ met · 🔄 partially met · ⛔ not met.

> **Verification commands in this document were wrong in two ways** and are now corrected:
> 1. **Ports.** The API listens on **3001**, the frontend on **3000**. Every `curl` below that hit
>    `localhost:3000/api/v1/...` was hitting the frontend.
> 2. **Scripts.** `test:coverage`, `test:perf`, `security:scan`, `deploy:staging` and `test:smoke`
>    **do not exist** in any `package.json`. They have been replaced with the scripts that do.

---

## Milestone Overview

| Milestone | Phase | Weeks | Key Deliverable | Status |
|-----------|-------|-------|-----------------|--------|
| M1 | Foundation | 1–2 | Auth + Database + Infrastructure | ✅ |
| M2 | Core Content | 3–5 | Users + Stories + Search | ✅ |
| M3 | Social | 6–7 | Interactions + Notifications + Messages | ✅ |
| M4 | Commerce | 8–10 | Books + Sales + Rentals + Payments | ✅ |
| M5 | Contests | 11–12 | Contest system complete | ✅ |
| M6 | Moderation | 13 | Moderation system | ✅ |
| M7 | Resilience & Observability | 14–16 | Event schema registry, DLQ, circuit breakers, retry, timeout, fallback | ✅ (replicas ⛔) |
| M8 | Production | 14–18 | Fully tested and deployed | ⛔ |

**Note on M7/M8 overlap:** resilience work was scheduled for Week 16 and *shipped early*, in the
Phase 1–2 window. M8 remains open because its deployment and operations items are not built. Both
milestones share Weeks 14–18.

---

## M1: Foundation (Weeks 1–2) — ✅

### Objective
Establish the project foundation: authentication, database, and basic infrastructure.

### Deliverables
- [x] Monorepo structure initialized — npm workspaces
- [x] NestJS backend with module structure
- [x] Next.js frontend with App Router
- [x] PostgreSQL database configured — 33 tables
- [x] Valkey cache configured
- [x] Docker Compose for local development — ⚠️ services only; **no `Dockerfile` exists**
- [x] CI/CD pipeline configured — `.github/workflows/ci.yml`, **11 jobs**. ⚠️ the previous version of
      this line said **10** and omitted `migration-roundtrip`

### Acceptance Criteria
1. **Project Structure** ✅
   - Monorepo with `frontend/`, `backend/`, and `packages/shared-types`
   - `docker-compose.yml` for PostgreSQL + Valkey
2. **Backend** ✅
   - NestJS application starts (`node dist/main.js`)
   - Health check endpoint responds at **`GET /api/v1/health`**
   - Database and cache connections established
3. **Frontend** ✅
   - Next.js application builds and starts
   - Basic routing works
   - Connects to the backend API via the Zod-validated `api.ts` layer
4. **Database** ✅
   - All 33 tables created by `npm run migration:run`
   - Seed data available via `npm run seed:dev`
   - ⚠️ **Connection-pool sizing is not configurable** — `DB_POOL_*` variables do not exist
5. **CI/CD** ✅
   - GitHub Actions runs on push and PR
   - Linting passes (0 errors)
   - TypeScript compilation passes
   - Tests run and gate the pipeline

### Verification Steps
```bash
# 1. Start the local services
docker compose up -d

# 2. Apply migrations
npm run migration:run

# 3. Confirm the ledger
npm run migration:status
npm run migration:verify

# 4. Seed
npm run seed:dev

# 5. Start the backend (Terminal 1)
cd backend && npm run start:dev

# 6. Start the frontend (Terminal 2)
cd frontend && npm run dev

# 7. Verify health — the API is on 3001 and the global prefix is api/v1
curl http://localhost:3001/api/v1/health

# 8. Run the test suites
npm test                                        # backend unit: 151 files / 3228 tests
npm run test:e2e --workspace=backend             # 23 files / 173 tests
npm run test:run --workspace=frontend            # 22 files / 356 tests
```

`GET /api/v1/health` returns:
```json
{
  "status": "healthy",
  "database": "connected",
  "valkey": "connected",
  "timestamp": "…"
}
```
(`status` is `degraded` if either dependency is down — `backend/src/app.controller.ts:62-73`, the
payload at `:67-72` and the `degraded` branch at `:68`. ⚠️ this citation previously read
**`app.controller.ts:31-27`**, which is a backwards, non-existent range.)

> ⚠️ `npm run migration:status` **did not exist at the repository root** until this change set. Steps 3
> above would have failed with `Missing script`. It exists now (`package.json:22`) and delegates to the
> backend workspace. Eight documents across `docs/` told readers to run it from the root.

> ⚠️ **These figures were all wrong before this pass** — 145/3047, 22/136 and 21/340 respectively. The
> integration count also hides something: until this change set, **all 11
> `test/*.integration-spec.ts` files were skipping themselves** because the Nest module graph could not
> build, so "23 files green" meant 23 files that never ran. See `docs/roadmap/risks.md`.

### Exit Conditions — met
- All acceptance criteria met
- No critical bugs
- Documentation updated

---

## M2: Core Content (Weeks 3–5) — ✅

### Objective
Users, stories, and search.

### Deliverables
- [x] User registration and login
- [x] User profile management — ✅ including `POST /api/v1/users` and `DELETE /api/v1/users/:id`
- [x] Story CRUD operations
- [x] Story publishing workflow
- [x] Sanity CMS integration
- [x] Search functionality — PostgreSQL full-text via the `0014` GIN indexes

### Acceptance Criteria
1. **User Management** ✅
   - Email/password registration and login
   - OAuth via Google, Apple, Facebook, GitHub, TikTok
   - Profile update
   - User statistics
   - ✅ **The `isVerified` write path exists** — `backend/src/modules/users/events/users.event-handler.ts:53`
2. **Story Management** ✅
   - Create, edit, publish
   - Published stories visible to readers
   - Sanity sync
3. **Search** ✅
   - By title, category, tag, author
   - Paginated
   - Case-insensitive

### Verification Steps
```bash
# Register
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","name":"Test","username":"testuser"}'

# Create a story (Bearer token, or the httpOnly cookie set by login)
curl -X POST http://localhost:3001/api/v1/stories \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Story","content":"<p>Content</p>","categoryId":"<uuid>"}'

# Publish
curl -X POST http://localhost:3001/api/v1/stories/<id>/publish \
  -H "Authorization: Bearer <accessToken>"

# Search
curl "http://localhost:3001/api/v1/stories?search=Test"
```

> ⚠️ Two corrections. The query field is **`search`**, not `q` — `StoriesQueryDto` declares `search`
> (`backend/src/modules/stories/dto/stories.dto.ts:231`) and the global `ValidationPipe` runs with
> `forbidNonWhitelisted`, so `?q=Test` is a **400**, not an empty result. (`q` *is* a real field, but on
> the sibling `SearchAuthorsQueryDto` for `GET /search/authors` — which is how the mistake read as
> correct.) The web client had the mirror-image bug and sent `q=` to `/search`, which is why the UI
> reported no results for every query.
>
> The create-story body takes `categoryId` (a UUID), not `category` (a slug). The previous version of
> this document showed `"category":"fiction"`, which the API does not accept.

### Exit Conditions — met
- All user flows work end-to-end
- Stories are searchable
- No critical bugs

---

## M3: Social (Weeks 6–7) — ✅

### Objective
Follows, reactions, comments, notifications, and messages.

### Deliverables
- [x] Follow/unfollow system
- [x] Story reactions
- [x] Comments with replies
- [x] Comment reactions
- [x] Notification system
- [x] Notification preferences
- [x] Direct messaging

### Acceptance Criteria
1. **Follow System** ✅ — follow/unfollow, follower counts, follower list
2. **Reactions** ✅ — `reactions.type` is a `varchar`, not a 6-value enum
3. **Comments** ✅ — threaded via self-referencing `parent_id`
4. **Notifications** ✅ — in-app, per-type preferences, read state
5. **Messages** ✅ — conversations, history, `is_read` / `read_at`

### Verification Steps

⚠️ **The previous version of this block was rewritten in full.** Three of its five commands hit routes
that **no controller declares** — `POST /users/:id/follow`, `POST /stories/:id/reactions` and
`POST /stories/:id/comments` — and the fifth, `POST /messages/conversations` with `{"recipientId",
"content"}`, **silently created an empty conversation and sent nothing**. The real routes are below.
Every path is under the global prefix `api/v1`; the API is on **3001** and the frontend on **3000**.

```bash
# ── Follows ─────────────────────────────────────────────────────────────
curl -X POST http://localhost:3001/api/v1/follows \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"followingId":"<userId>"}'

curl -X DELETE http://localhost:3001/api/v1/follows/<userId> \
  -H "Authorization: Bearer <accessToken>"

curl "http://localhost:3001/api/v1/follows/user/<userId>/followers" \
  -H "Authorization: Bearer <accessToken>"

curl "http://localhost:3001/api/v1/follows/user/<userId>/following" \
  -H "Authorization: Bearer <accessToken>"

curl http://localhost:3001/api/v1/follows/check/<userId> \
  -H "Authorization: Bearer <accessToken>"

# ── Reactions — type is one of love|like|wow|sad|angry|haunted ───────────
curl -X POST http://localhost:3001/api/v1/reactions/stories/<storyId> \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"type":"love"}'

curl -X DELETE http://localhost:3001/api/v1/reactions/stories/<storyId> \
  -H "Authorization: Bearer <accessToken>"

curl http://localhost:3001/api/v1/reactions/stories/<storyId>/counts

# ── Comments — the collection is the bare @Controller('comments') ─────────
curl http://localhost:3001/api/v1/comments/story/<storyId>

curl "http://localhost:3001/api/v1/comments/<commentId>/replies"

curl -X POST http://localhost:3001/api/v1/comments \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"storyId":"<storyId>","content":"Great story!"}'

curl -X PATCH http://localhost:3001/api/v1/comments/<commentId> \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Great story, revised."}'

curl -X DELETE http://localhost:3001/api/v1/comments/<commentId> \
  -H "Authorization: Bearer <accessToken>"

curl -X POST http://localhost:3001/api/v1/comments/<commentId>/reactions \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"type":"love"}'

# ── Notifications — unread-count (not /unread/count), PATCH /read-all ────
curl http://localhost:3001/api/v1/notifications \
  -H "Authorization: Bearer <accessToken>"

curl http://localhost:3001/api/v1/notifications/unread-count \
  -H "Authorization: Bearer <accessToken>"

curl -X PATCH http://localhost:3001/api/v1/notifications/<id>/read \
  -H "Authorization: Bearer <accessToken>"

curl -X PATCH http://localhost:3001/api/v1/notifications/read-all \
  -H "Authorization: Bearer <accessToken>"

# ── Messages — creating a conversation and sending are two calls ─────────
curl -X POST http://localhost:3001/api/v1/messages/conversations \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"recipientId":"<userId>"}'

curl -X POST http://localhost:3001/api/v1/messages/conversations/<conversationId>/messages \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello!"}'

curl -X PATCH http://localhost:3001/api/v1/messages/<messageId>/read \
  -H "Authorization: Bearer <accessToken>"
```

Three of these were themselves broken and are corrected above:

- ⚠️ `PATCH /messages/messages/:messageId/read` had a **doubled path segment** — the route string
  `messages/:messageId/read` under `@Controller('messages')` produced a path that never matched, so
  read receipts were unmarkable over HTTP. Now `PATCH /messages/:messageId/read`
  (`messages.controller.ts:125`).
- ⚠️ `GET /notifications/unread/count` and `PUT /notifications/read-all` were **duplicate routes**
  beside `unread-count` and `PATCH /read-all`. The duplicates are removed.
- ⚠️ `reactions.type` is a `varchar`, so the enumeration is enforced by `@IsIn` in the DTO rather than by
  the schema. `love | like | wow | sad | angry | haunted`.

> ⛔ **The web client called three of these wrongly, and all of it was a 404.** `frontend/src/lib/api.ts`
> used `/users/:id/follow`, `/stories/:id/reactions` and `/stories/:id/comments` — **none of which any
> controller declares**. Twelve call sites are corrected to the routes above and pinned by
> `frontend/src/lib/api.contract.test.ts` against the backend controller that declares each one. **But the
> social UI pages are still static placeholders with no call sites**: the client methods are correct and
> pinned, and nothing invokes them yet.

> ✅ **Resolved — the top-level-comments defect this milestone used to carry as open is closed.** The
> previous version of this document said: *"Known bug. `GET /api/v1/comments/story/:storyId` uses
> `eq(comments.parentId, null as unknown as string)` … It should be `isNull()`. The bug is pinned with a
> test rather than silently fixed."* **That was false on all four counts.** The repository uses
> **`isNull()`** at `backend/src/modules/comments/repositories/comments/repository.ts:48`, fixed in commit
> `01134dd`. The lines it cited — **45 and 52** — are a code comment and a `Promise.all` destructure. And
> `comments.repository.spec.ts:111` asserts the **fixed** predicate (`and(eq(storyId), isNull(parentId),
> eq(isDeleted, false))`), not the broken one. And "pinned with a test rather than silently fixed"
> implies `it.fails`, and **there is no `it.fails` anywhere in this repository** —
> `grep -rn "it\.fails\|test\.fails\|describe\.fails"` over `backend/` and `frontend/` returns nothing.
> Two tests now pin the fixed behaviour: `comments.repository.spec.ts:111` (the predicate itself) and
> `:102` (that the page and the count share one predicate, so `total` cannot disagree with the rows).

### Exit Conditions — met.

---

## M4: Commerce (Weeks 8–10) — ✅

### Objective
Books, sales, rentals, and payment processing.

### Deliverables
- [x] Book CRUD operations
- [x] Book sales system — `POST /api/v1/books/:id/purchase`
- [x] Book rental system — `POST /api/v1/books/:id/rent`
- [x] Rental extensions
- [x] User library — `GET /api/v1/library`
- [x] Paymob integration — ✅ **real**: full flow through `ResilientHttpClient` with Zod on every
      response; the previous stub fabricated a URL with no HTTP call
- [x] Payment webhooks — `POST /api/v1/payments/webhooks/paymob`, idempotent via a unique index on
      `payments.paymob_transaction_id`

### Acceptance Criteria
1. **Books** ✅ — create, cover + PDF via presigned S3 URLs, catalog listing
2. **Sales** ✅ — purchase flow, Paymob payment, `library` row, access grant
3. **Rentals** ✅ — `duration_days` (an `@IsIn([1,3,7,14,30,90])` integer), extensions, expiry
4. **Library** ✅ — purchased books permanent, rented time-limited, `reading_progress` tracked
5. **Gateway fields** ✅ — `paymob_payment_key`, `paymob_iframe_url`, `paymob_accept_url` persisted
   (migration `0016`)

### Verification Steps
```bash
curl -X POST http://localhost:3001/api/v1/books \
  -H "Authorization: Bearer <accessToken>" \
  -F "title=My Book" \
  -F "pdf=@book.pdf"

curl -X POST http://localhost:3001/api/v1/books/<id>/purchase \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"paymentMethodId":"pm_123"}'

curl -X POST http://localhost:3001/api/v1/books/<id>/rent \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"durationDays":7}'

curl http://localhost:3001/api/v1/library \
  -H "Authorization: Bearer <accessToken>"
```

> ⚠️ Two corrections to the previous version: the purchase body is `{ paymentMethodId }` only
> (the doc invented a `duration` field and used `"one_week"`, an enum value that does not exist —
> rentals take `durationDays` as an **integer** in `[1,3,7,14,30,90]`, not the string
> `"one_week"`), and the port is 3001.

### Exit Conditions — met, with two caveats:
- ⛔ **No live-sandbox verification.** The Paymob client is unit-tested against Zod-validated
  fixtures; no test has ever reached Paymob's API. Sandbox vs live is selected by
  `PAYMOB_ENVIRONMENT` (which swaps the credential set), **not** by the base URL — both modes use
  `https://accept.paymob.com/api`.
- ✅ A Paymob failure now returns 503 and marks the local payment `failed`, rather than fabricating
  a checkout URL.

---

## M5: Contests (Weeks 11–12) — ✅

### Objective
Contest system with submissions, voting, and prizes.

### Deliverables
- [x] Contest creation
- [x] Submission system
- [x] Voting system
- [x] Winner selection
- [x] Prize distribution — `contest_prizes`
- [x] **Badge awards** — ✅ the `badges` module, `badges` / `user_badges` tables, and
      `GET /api/v1/badges`. This was an open roadmap item and has shipped
- [x] Contest notifications
- [x] Publisher dashboard — `GET /api/v1/contests/publisher/stats` and siblings

### Acceptance Criteria
1. **Contest Management** ✅ — create, start, cancel, complete
2. **Submissions** ✅ — submit, approve, reject
3. **Voting** ✅ — `contest_votes`, counted
4. **Winner Selection** ✅ — `POST /api/v1/contests/:id/winner`, prize row, badge award

### Verification Steps
```bash
curl -X POST http://localhost:3001/api/v1/contests \
  -H "Authorization: Bearer <publisherToken>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Contest","categoryId":"<uuid>","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}'

curl -X POST http://localhost:3001/api/v1/contests/<id>/submissions \
  -H "Authorization: Bearer <authorToken>" \
  -H "Content-Type: application/json" \
  -d '{"storyId":"<storyId>"}'

curl -X POST http://localhost:3001/api/v1/contests/<id>/votes \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"submissionId":"<submissionId>"}'

curl -X POST http://localhost:3001/api/v1/contests/<id>/winner \
  -H "Authorization: Bearer <publisherToken>" \
  -H "Content-Type: application/json" \
  -d '{"submissionId":"<submissionId>"}'
```

### Exit Conditions — met.

---

## M6: Moderation (Week 13) — ✅

### Objective
Reporting, moderation actions, user restrictions, and the admin dashboard.

### Deliverables
- [x] Reporting system — `POST /api/v1/moderation/reports`; `reports.source` distinguishes
      user-filed from auto-filed reports (migration `0018`)
- [x] Auto-escalation — called on report creation (`backend/src/modules/moderation/moderation.service.ts:91`) and swept on an
      interval by `moderation/escalation.scheduler.ts`
- [x] Moderation actions — `moderation_actions` table
- [x] User restrictions — `user_restrictions` + `RestrictionGuard`
- [x] Admin dashboard — `/moderation/stats`, `/reports/trends`, `/actions`,
      `/users/:id/restrictions`

### Acceptance Criteria
1. **Moderation** ✅ — report, act, auto-escalate, restrict
2. **Authorization** ✅ — `GET /api/v1/moderation/stats` requires
   `@Secured(AccountType.ADMIN) + @RequireAdminRole(AdminRole.SUPER_ADMIN)`.
   Previously `@RequireAdminRole` was dead metadata with no `RolesGuard` applied, so **any**
   authenticated user could read it
3. **Escalation** ✅ — the status enums in `report.dto.ts` include `escalated`, and
   `autoEscalateReports` can write it

### Verification Steps
```bash
# As a moderator
curl -X POST http://localhost:3001/api/v1/moderation/reports \
  -H "Authorization: Bearer <moderatorToken>" \
  -H "Content-Type: application/json" \
  -d '{"targetId":"<storyId>","targetType":"story","reason":"spam"}'

# As a moderator
curl http://localhost:3001/api/v1/moderation/reports \
  -H "Authorization: Bearer <moderatorToken>"

# Stats require super_admin — a reader or content_moderator gets 403
curl -i http://localhost:3001/api/v1/moderation/stats \
  -H "Authorization: Bearer <readerToken>"
```

### Exit Conditions — met.

---

## M7: Resilience & Observability (Weeks 14–16) — ✅ with exceptions

Shipped early (during Phases 1–2), not in Weeks 15–16.

### Deliverables
- [x] Event schema registry — `common/events/event-schema-registry.ts`
- [x] Dead Letter Queue — `common/events/dlq.service.ts`, **with a working drain**: `DLQController`
      serves `GET /events/dlq` and `POST /events/dlq/:id/replay`, and
      `EventValidatorService.replayDeadLettered` re-validates the stored payload against its schema
      before re-emitting it. ⚠️ the previous version of this line carried the dead-letter queue as a
      plain ✅ with no drain mentioned, while `implementation-roadmap.md` simultaneously claimed it had
      none and that a dead-lettered event was never redelivered — the two documents contradicted each
      other and the code sided with neither. `retryDLQ` is deleted; `getDLQStats` is the only remaining
      spec-only method
- [x] Event versioning — **55** registered event names, all `v1`, **10** event-constant modules, and **16** files containing `@OnEvent` under `backend/src/modules/` (15 in a `*/events/` directory, plus `stories/sanity/sanity-sync.event-handler.ts`). `EventBusModule` has been deleted; `CommonModule` calls `EventEmitterModule.forRoot(...)` directly
- [x] Event validation — `event-validator.service.ts`
- [x] Circuit breakers — ✅ **wired**, not dead code: injected into `auth.service.ts` and
      `stories/sanity/sanity.service.ts`
- [x] Retry with exponential backoff — `RetryService` via `ResilientHttpClient`
- [x] Timeout configuration — `TimeoutService`
- [x] Fallback strategies — `FallbackService`
- [x] **Unit tests** for all of the above
- [ ] ⛔ Read replica — **NOT BUILT.** `grep -rni replica backend/src` → no matches
- [ ] ⛔ Read/write splitting — **NOT BUILT**
- [ ] ⛔ Replication lag monitoring — **NOT BUILT**

### Verification Steps
```bash
npm test --workspace=backend -- \
  src/common/resilience src/common/events
```

### Exit Conditions
- ✅ Circuit breakers, retry, timeout, fallback — met
- ⛔ Read replicas — not met, and not scheduled anywhere in the repository

---

## M8: Production (Weeks 14–18) — ⛔ NOT MET

### Objective
Complete testing, optimisation, and deploy to production.

### Deliverables
- [x] Comprehensive tests — ⚠️ **every figure in this line was wrong.** **3228** backend unit
      (**151** files), **173** backend e2e/integration (**23** files = 11 `src/**/e2e/*.e2e-spec.ts` +
      1 `test/app.e2e-spec.ts` + **11** `test/*.integration-spec.ts`), **356** frontend (**22** files),
      **15** Playwright (**3** files, frontend only). The previous line read "3047 backend unit (145
      files), 136 backend e2e/integration (22 files), 340 frontend (21 files), 9 Playwright (2 files)"
- [x] ⚠️ **and the e2e/integration suite only started executing in this change set.** All 11
      `test/*.integration-spec.ts` files were **skipping themselves** because `BooksModule` ↔
      `LibraryModule` had no `forwardRef()` and the Nest graph could not build — while CI stayed green.
      8 previously-never-executed tests then failed on stale fixtures and were fixed
- [x] Security audit in CI — `npm audit --omit=dev` + `npm audit`
- [x] Monitoring setup — Sentry (`@sentry/nestjs@11.1.0`) + Winston
- [ ] ⛔ **Production deployment — NOT BUILT.** No `Dockerfile`, no manifest, no IaC, no deploy
      script. `docs/deployment/deployment.md` describes a containerised Railway deploy with no
      artifact behind it
- [ ] ⛔ **Backup automation — NOT BUILT.** The strategy is documented; nothing runs it.
      `docs/deployment/backup-strategy.md` schedules four scripts under `/opt/hakawi/scripts/` and a
      crontab entry, and **none of them exists** in this repository. (`backup.md` was already
      corrected to say so; four other documents still repeat the stale claim)
- [ ] ⛔ **Load testing — NOT BUILT.** No k6 / Locust / autocannon / Artillery config
- [ ] ⛔ **Performance benchmarking — NOT BUILT.** The p95 targets have never been measured
- [ ] ⛔ **Security penetration testing — NOT BUILT**
- [ ] ⛔ **User documentation — NOT BUILT**
- [ ] ⛔ **Alerting rules — NOT BUILT**
- [ ] ⛔ **Duplicated contest notifications** — `contests.event-handler.ts` and
      `notifications.event-handler.ts` both subscribe to `winner.selected` and `prize.distributed`, so a
      winner gets **two** rows for each. Recorded, not fixed: one side must be declared canonical
- [ ] ⛔ **Social UI pages have no call sites** — the twelve corrected client methods are pinned to the
      real routes, but nothing on the web client invokes them

### Acceptance Criteria
1. **Testing** 🔄 — ✅ backend above the gate (**S 84.28 / B 80.49 / F 78.86 / L 84.45** against floors
   78/73/70/79 and 9 ratchets); ⛔ frontend is **S 40.75 / B 35.79 / F 39.64 / L 41.25** against an 80%
   target, and the gate itself is set to 38/33/33/38 — it encodes the current number rather than the
   target. ⚠️ **both quadruples were wrong before this pass** (the document said 85.43/82.39/79.00/85.58
   and 39.79/35.90/35.74/40.22)
2. **Performance** ⛔ — no benchmark harness exists, so no target has been measured
3. **Security** 🔄 — CI audit passes; ⛔ no pentest, ⛔ no WAF metrics endpoint, ⛔ no admin
   operations endpoints to manage blocks
4. **Deployment** ⛔ — nothing to deploy
5. **Monitoring** 🔄 — Sentry wired; ⛔ no dashboards, ⛔ no alert rules

### Verification Steps — the real ones

```bash
# 1. All test suites
npm test                                              # backend unit + coverage gate: 151 files / 3228 tests
npm run test:e2e --workspace=backend                 # 23 e2e/integration files / 173 tests, needs a live PostgreSQL and Valkey
npm run test:run --workspace=frontend                # 22 files / 356 tests
npm run test:coverage --workspace=frontend

# 2. Quality gates
npm run lint
npm run typecheck
npm run build                                        # shared-types, then backend, then frontend

# 3. Migrations
npm run db:check                                     # static, no database
npm run migration:status                             # exists at the root as of 2026-10-04; did not before
npm run migration:verify

# 4. Security audit
npm audit --omit=dev
```

**Scripts that do not exist** and were previously documented here:
`test:coverage` (root), `test:perf`, `security:scan`, `deploy:staging`, `test:smoke`. None of these
appears in the root, `backend`, or `frontend` `package.json`.

**Scripts that did not exist and now do**: `npm run migration:status` **at the repository root**. It was
in `backend/package.json` only, and this document's own step 3 above instructed the reader to run it from
the root, where it returned `Missing script`.

### Exit Conditions — not met
- ⛔ Production deployed
- ⛔ Performance meets targets (unmeasured)
- 🔄 Security audit passed (CI only)
- ⛔ Backup automation
- ⛔ Alerting

---

## Milestone Gates

### Gate Criteria
Each milestone requires:
1. All acceptance criteria met
2. All tests passing
3. No critical bugs
4. Documentation updated

### Blockers
If a milestone is not met:
1. Document blockers
2. Assess impact on the next milestone
3. Adjust the timeline if needed

M8 is the current blocker, and its blockers are enumerated in
[`../phases/implementation-roadmap.md`](../phases/implementation-roadmap.md#open-items--the-complete-list-of-⛔-work).

---

## Changelog — reconciliation (2026-09-30)

| Previous | Reality |
|---|---|
| 6 milestones, M4 = weeks 9–11, M5 = weeks 12–13, M6 = weeks 14–16 | Unified on the canonical **8 milestones / 18 weeks** model: M4 = 8–10, M5 = 11–12, M6 = 13, M7 = 14–16, M8 = 14–18 |
| Moderation was inside "M6 Production" | Split into its own milestone M6 (week 13) and a resilience milestone M7, because the two have completely different status |
| Every `curl` used **port 3000** for API calls | The API is on **3001** with the `api/v1` prefix. All 20+ commands corrected |
| `npm run test:coverage` (root) | ⛔ Does not exist. Replaced with `npm test` (backend, which includes the coverage gate) and `npm run test:coverage --workspace=frontend` |
| `npm run security:scan` | ⛔ Does not exist. Replaced with `npm audit --omit=dev` |
| `npm run test:perf` | ⛔ Does not exist, and no perf harness exists. Removed rather than replaced |
| `npm run deploy:staging` | ⛔ Does not exist. There is no deployment script |
| `npm run test:smoke` | ⛔ Does not exist. Replaced with the e2e suite |
| Health check shown as `curl http://localhost:3000/health` | `GET /api/v1/health` on port 3001. The endpoint also returns `degraded` rather than a `services: { sanity }` object — the app checks PostgreSQL and Valkey only |
| "Connection pooling configured" | ⚠️ `DB_POOL_MIN` / `DB_POOL_MAX` / `DB_POOL_IDLE_TIMEOUT` do not exist; pool sizing is not configurable |
| "Messages are real-time" | ✅ WebSocket gateway with a Redis adapter, but ⚠️ never load-tested |
| Story create body shown with `"category":"fiction"` | The API takes `categoryId` (UUID) |
| Rental body shown with `"duration":"one_week"` | The API takes `durationDays` as an **integer** in `[1,3,7,14,30,90]` (`@IsIn`). An enumeration, but not a `CREATE TYPE` enum, and the key is `durationDays` not `duration` |
| M1 "Docker Compose for local development" listed as met | Kept, with the note that there is **no `Dockerfile`** — it is services only |
| Moderation listed under M6 Production with no status | Now its own milestone M6, ✅, including the note that the `@RequireAdminRole` authorization hole is closed |

---

## Changelog — reconciliation (2026-10-04)

Three of this document's verification blocks were executed against the code rather than read. Two were
wrong; one was false on all four of its claims.

| Problem | Resolution |
|---|---|
| **M3's "Known bug" note about top-level comments was false on all four counts.** It said the repository uses `eq(parentId, null as unknown as string)` at `comments/repository.ts:45,52`; that the cited lines were the defect; that a test pinned the bug rather than fixing it; and the exit condition repeated the bug as open | **Deleted and replaced with a "Resolved" note.** The repository uses `isNull()` at `comments/repository.ts:48` (commit `01134dd`); lines **45 and 52** are a code comment and a `Promise.all` destructure; `comments.repository.spec.ts:111` asserts the **fixed** predicate; and there is **no `it.fails` anywhere in the repository**. Two tests pin it — `:111` (the predicate) and `:102` (page and count share one predicate). The M3 exit condition no longer reads "with the top-level-comments bug above open" |
| **M3's verification block sent three requests to routes that do not exist.** `POST /users/:id/follow`, `POST /stories/:id/reactions` and `POST /stories/:id/comments` are declared by no controller, and the fifth command — `POST /messages/conversations` with `{"recipientId","content"}` — created an empty conversation and sent nothing | **Rewritten in full**, 20 commands against the real routes: `/follows`, `/reactions/stories/:storyId`, `/comments` (the bare collection, not a story sub-route), `/notifications/unread-count`, `PATCH /notifications/read-all`, and the two-step conversation-then-message sequence |
| **M2's search curl returned 400.** `?q=Test` is not a field on `StoriesQueryDto`; the field is **`search`**, and `forbidNonWhitelisted` turns the unknown key into a 400 | Corrected to `?search=Test`, with a note that `q` is real but belongs to the sibling `SearchAuthorsQueryDto` — which is how the mistake survived review |
| Health citation `backend/src/app.controller.ts:31-27` | **`:62-73`** (payload `:67-72`, `degraded` at `:68`). The old range was backwards and did not exist |
| CI described as **10 jobs** | **11** — `migration-roundtrip` was missing, and it is the only job that runs the down scripts |
| "22 e2e/integration files, needs a live PostgreSQL and Valkey" — presented as a passing suite | **23 files / 173 tests**, and the note that until this change set **all 11 integration specs were skipping themselves** because the module graph could not build. "Needs a live database" was true and hid the fact that nothing had ever connected |
| Every test figure (145/3047, 22/136, 21/340, 2/9) | **151/3228, 23/173, 22/356, 3/15** |
| Both coverage quadruples | backend **S 84.28 / B 80.49 / F 78.86 / L 84.45**; frontend **S 40.75 / B 35.79 / F 39.64 / L 41.25**. All eight previously published values were wrong |
| `npm run migration:status` instructed from the repo root | ⚠️ **that script did not exist at the root** — this document's own step 3 would have failed with `Missing script`. It exists now (`package.json:22`), and both places that name it say so |
| M7 listed the DLQ as a bare ✅ while `implementation-roadmap.md` claimed it had no drain and never redelivered | M7 now states the drain that exists (`GET /events/dlq`, `POST /events/dlq/:id/replay`), notes `retryDLQ` is deleted and `getDLQStats` is the remaining spec-only method, and records that the two documents used to contradict each other |
| M2's `@Secured()` composed three guards | Not stated here, but the four-guard composition (`JwtAuthGuard` + `RestrictionGuard` + `RolesGuard` + `PermissionsGuard`) is now recorded in `phases/implementation-roadmap.md`, which previously omitted `RestrictionGuard` — the guard that makes a moderation `ban` do anything |
| Two M8 items are new and unfixed | ⛔ duplicated contest notifications (two handlers subscribe to `winner.selected` and `prize.distributed`), and ⛔ social UI pages with no call sites. Both are recorded rather than softened |

### Re-verified and unchanged
Coverage floors 79/70/73/78 with 9 per-path ratchets · frontend gate 38/33/33/38 · ports 3001 (API) and
3000 (frontend) · global prefix `api/v1` · `durationDays` as an integer in `[1,3,7,14,30,90]` ·
`categoryId` as a UUID · the five non-existent scripts listed above.

---

*This document defines milestones for the Hakawi implementation.*
