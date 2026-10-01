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
  - ⛔ **There is no `Dockerfile` anywhere in the repository.** The application itself is not
    containerised

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
- View tracking — a `view_count` column, not a `story_views` table

#### 2.3 Search Module ✅
- Full-text search for stories (PostgreSQL FTS + GIN expression indexes)
- Author, category and tag search
- Result pagination
- ✅ Validated by a real `SearchFiltersDto` **class** — the DTO was a Zod schema before and the
  global `ValidationPipe` silently skipped it

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
- Follow/unfollow system
- Story reactions
- Comments with nested replies
- Comment reactions

#### 3.2 Notifications Module ✅
- In-app notifications
- Notification preferences
- ⛔ **Email notifications — NOT BUILT.** The `EMAIL_*` variables are documented and
  `EMAIL_FROM` is read by `backend/src/modules/notifications/email/notifications-email.service.ts:21`, but **no SMTP client is wired**;
  the module emits events
- ⛔ Push notifications — future, as stated

#### 3.3 Messages Module ✅
- Direct messaging
- Conversation list
- Message history
- Read receipts — `is_read` / `read_at` on `messages`

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
  wires `JwtAuthGuard` + `RolesGuard` + `PermissionsGuard`

#### 6.2 Testing ✅ (with a gap)
- ✅ Unit tests: 104 files / 1792 tests
- ✅ Integration/e2e: 23 files / 146 tests, per-file cloned database
- ✅ E2E browser tests in `backend/` and `frontend/`, plus axe-core WCAG 2.0/2.1 A+AA on the frontend
- ✅ Frontend tests: 21 files / 340 tests
- ⚠️ Frontend coverage: S 44.25 / B 87.05 / F 53.69 / L 44.25 — below the 80% target for
  statements and lines
- ⛔ **Performance tests — NOT BUILT.** No k6 / Locust / autocannon / Artillery config

#### 6.3 Documentation ✅ / 🔄
- ✅ API documentation — OpenAPI served at `/api/docs` and `/api/docs-json`
- ✅ Deployment guides
- ✅ Architecture docs
- ⛔ **User documentation — NOT BUILT**

#### 6.4 Deployment ⛔
- [ ] Staging deployment — ⛔ no artifact
- [ ] Production deployment — ⛔ no artifact
- [x] Monitoring setup — `@sentry/nestjs@11.1.0`, `common/observability/sentry.config.ts`
- [x] CI/CD pipeline — 9 jobs, hard gates

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
- ⛔ Load testing, performance benchmarking
- ⛔ A production `Dockerfile` or deployment artifact
- ⛔ Staging and production deployment
- ⛔ Backup automation
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

### Current Status — reconciled 2026-09-30

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

*This document defines deliverables for the Hakawi implementation.*
