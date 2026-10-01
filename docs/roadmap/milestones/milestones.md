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
- [x] CI/CD pipeline configured — `.github/workflows/ci.yml`, 9 jobs

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
npm test                                        # backend unit: 104 files / 1792 tests
npm run test:e2e --workspace=backend             # 23 files / 146 tests
npm run test:run --workspace=frontend            # 21 files / 340 tests
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
(`status` is `degraded` if either dependency is down — `backend/src/app.controller.ts:31-27`.)

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
curl "http://localhost:3001/api/v1/stories?q=Test"
```

> ⚠️ The create-story body takes `categoryId` (a UUID), not `category` (a slug). The previous
> version of this document showed `"category":"fiction"`, which the API does not accept.

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
```bash
curl -X POST http://localhost:3001/api/v1/users/<id>/follow \
  -H "Authorization: Bearer <accessToken>"

curl -X POST http://localhost:3001/api/v1/stories/<id>/reactions \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"type":"love"}'

curl -X POST http://localhost:3001/api/v1/stories/<id>/comments \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Great story!"}'

curl http://localhost:3001/api/v1/notifications \
  -H "Authorization: Bearer <accessToken>"

curl -X POST http://localhost:3001/api/v1/messages/conversations \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"recipientId":"<id>","content":"Hello!"}'
```

> ⚠️ **Known bug.** `GET /api/v1/comments/story/:storyId` uses
> `eq(comments.parentId, null as unknown as string)`, which emits `parent_id = NULL` and is never
> true, so it always returns zero top-level comments
> (`backend/src/modules/comments/repositories/comments.repository.ts:45,52`). It should be
> `isNull()`. The bug is pinned with a test rather than silently fixed.

### Exit Conditions — met, with the top-level-comments bug above open.

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
- [x] Dead Letter Queue — `common/events/dlq.service.ts`
- [x] Event versioning — 16 event modules
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
- [x] Comprehensive tests — 1792 backend unit, 146 backend e2e, 340 frontend
- [x] Security audit in CI — `npm audit --omit=dev` + `npm audit`
- [x] Monitoring setup — Sentry (`@sentry/nestjs@11.1.0`) + Winston
- [ ] ⛔ **Production deployment — NOT BUILT.** No `Dockerfile`, no manifest, no IaC, no deploy
      script. `docs/deployment/deployment.md` describes a containerised Railway deploy with no
      artifact behind it
- [ ] ⛔ **Backup automation — NOT BUILT.** The strategy is documented; nothing runs it. The
      `nginx.conf` and `scripts/` directory that `docs/deployment/backup.md` backs up do not exist
- [ ] ⛔ **Load testing — NOT BUILT.** No k6 / Locust / autocannon / Artillery config
- [ ] ⛔ **Performance benchmarking — NOT BUILT.** The p95 targets have never been measured
- [ ] ⛔ **Security penetration testing — NOT BUILT**
- [ ] ⛔ **User documentation — NOT BUILT**
- [ ] ⛔ **Alerting rules — NOT BUILT**

### Acceptance Criteria
1. **Testing** 🔄 — ✅ backend above the gate; ⚠️ frontend statements/lines are 44.25, below the
   80% target
2. **Performance** ⛔ — no benchmark harness exists, so no target has been measured
3. **Security** 🔄 — CI audit passes; ⛔ no pentest, ⛔ no WAF metrics endpoint, ⛔ no admin
   operations endpoints to manage blocks
4. **Deployment** ⛔ — nothing to deploy
5. **Monitoring** 🔄 — Sentry wired; ⛔ no dashboards, ⛔ no alert rules

### Verification Steps — the real ones

```bash
# 1. All test suites
npm test                                              # backend unit + coverage gate
npm run test:e2e --workspace=backend                 # 23 e2e files, needs a live PostgreSQL
npm run test:run --workspace=frontend
npm run test:coverage --workspace=frontend

# 2. Quality gates
npm run lint
npm run typecheck
npm run build                                        # shared-types, then backend, then frontend

# 3. Migrations
npm run db:check                                     # static, no database
npm run migration:status
npm run migration:verify

# 4. Security audit
npm audit --omit=dev
```

**Scripts that do not exist** and were previously documented here:
`test:coverage` (root), `test:perf`, `security:scan`, `deploy:staging`, `test:smoke`. None of these
appears in the root, `backend`, or `frontend` `package.json`.

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

*This document defines milestones for the Hakawi implementation.*
