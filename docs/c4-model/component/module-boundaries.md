# Module Boundaries (C4 Level 3)
## Hakawi - Module Responsibilities and Contracts

C4 **component-level** view of the NestJS modules: what each one is responsible for, and which
dependency rules hold versus which are aspirational.

Reconciled against `backend/src/app.module.ts` and `backend/src/modules/**` on 2026-09-30.

> **The authoritative module inventory is
> [`docs/module-boundaries/overview/module-boundaries.md`](../../module-boundaries/overview/module-boundaries.md).**
> That document lists all **23** registered modules, the full dependency graph, and the real route
> surface. This one is the C3 view: responsibilities and rules.

Status markers: ✅ as described · ⚠️ partial / drifted · ⛔ does not exist.

---

## Purpose

Hakawi is a **modular monolith**. Each business domain is encapsulated in a Nest module. Modules
communicate through a typed event bus, module-owned repository interfaces, and a small number of
deliberate direct service calls.

---

## Module Organization

`backend/src/app.module.ts` imports **23** modules across four groups.

### Core / Infrastructure — 3

| Module | Responsibility | Notable |
|---|---|---|
| **DatabaseModule** | The `pg` Pool and the Drizzle instance | The module-level singleton every other module imports |
| **CommonModule** | Every cross-cutting primitive | `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`, `RestrictionGuard`, `OwnershipGuard`, `AllExceptionsFilter`, `LoggingInterceptor`, `CacheInterceptor` + `CacheMetrics`, `WafMiddleware`, `ValkeyThrottlerStorage`, the event bus with its schema registry and DLQ, the resilience module, Sentry, `ValkeyService`, `EncryptionService`. `@Secured()` composes **4** guards; `OptionalJwtAuthGuard` is **not** in `CommonModule` — `StoriesModule` registers it for the two public story-detail routes |
| **SharedCacheModule** | `@Global()` cache-aside | `TaggedCacheService` — the tag set and invalidation mechanism |

### Identity — 3

#### Auth Module
**Responsibility:** authentication, token lifecycle, and OAuth.

**Depends On:** the shared `IUsersRepository` (`backend/src/common/users/users-repository.interface.ts`),
Valkey (refresh-token blacklist, password-reset TTL), `CircuitBreakerService` for OAuth calls
(`backend/src/modules/auth/auth.service.ts:59`), `EncryptionService` for the reset token.

**Events Published:** `user.registered`, `user.updated`, `password.reset.requested`,
`password.reset.completed`, `email.verification.requested`, `email.verified`

**Events Consumed:** none

⚠️ **Corrections to the previous version of this section:**
- "Session creation and revocation" — ⛔ **there is no session store.** A "session" is a signed JWT
  pair; the only server-side token state is the refresh-token blacklist. See
  `docs/security-architecture/auth/auth-overview.md`
- `user.logged_in` / `user.logged_out` — ⛔ **neither event exists.** The real user events are
  `user.registered`, `user.updated`, `user.followed`, `user.unfollowed`, `user.restricted`,
  `user.online`, `user.offline`, `user.typing`
- "Cache (session storage)" — ⚠️ Valkey stores the **refresh-token blacklist**, not sessions

#### Users Module
**Responsibility:** profile, statistics, and the verification workflow.

**Depends On:** `IUsersRepository`; the event bus. **No Auth dependency** — it reacts to
`user.registered`.

**Routes:** `GET/PATCH /users/me`, `GET /users/me/verification`, `POST /users/me/verification`,
`POST /users/verification/confirm`, `GET /users/:id`, `GET /users/:id/stats`, `PATCH /users/:id`,
`DELETE /users/me`, plus `POST /users` and `DELETE /users/:id` (both super-admin only).

⛔ **The previous version listed `POST /users/:id/verify`. It does not exist.**
⚠️ `user.verified` is **not** an event name. Verification emits `email.verification.requested` and
`email.verified`; the `isVerified` write happens in `backend/src/modules/users/events/users.event-handler.ts:53`.

#### Badges Module — ⛔ absent from the previous version
**Responsibility:** the badge catalogue and awards.

**Routes:** `GET /badges`, `GET /badges/users/:userId`, `POST /badges/users/:userId` (super-admin).
**Tables:** `badges`, `user_badges` (migration `0013`). A winner badge is a `user_badges` row —
there is no `contest_badges` table.

---

### Content — 5

| Module | Responsibility | Key reality |
|---|---|---|
| **Stories** | Story CRUD, publishing, Sanity sync, view tracking | `CircuitBreakerService` for Sanity; cache tag `stories`. Routes also include `GET /stories/slug/:slug`, `/publish`, `/archive` |
| **Categories** | Category tree | Self-referencing `parent_id` for sub-categories |
| **Tags** | Tag catalogue | Owns the `story_tags` and `book_tags` join tables |
| **Search** | PostgreSQL full-text search | `ISearchRepository`; the `search` throttle tier (50/min). ⚠️ the previous version said "Search depends on Stories and Users" — in fact **Stories/Search are independent**; there is no import between them |
| **Upload** | Presigned S3 URLs for images and PDFs | Routes are `POST /upload/image` and `POST /upload/pdf` — **no `-url` suffix**. The `upload` throttle tier is 5/min |

---

### Social — 7

| Module | Routes | Notes |
|---|---|---|
| **Follows** | `POST /follows`, `DELETE /follows/:followingId`, `GET /follows/user/:userId/followers`, `/following`, `/stats`, `GET /follows/check/:followingId` | ⚠️ base path is `/follows`, **not** `/users/:id/follow` |
| **Reactions** | `POST`/`DELETE`/`GET /reactions/stories/:storyId`, `/counts`, `/me` | ⚠️ base path is `/reactions/stories/:storyId`, **not** `/stories/:id/reactions` |
| **Comments** | `GET /comments/story/:storyId`, `GET /comments/:id/replies`, `POST/PATCH/DELETE /comments` | ⚠️ base path is `/comments`. Threading via the `parent_id` self-FK |
| **Notifications** | **8 routes**: `GET /notifications`, `GET /notifications/unread`, `GET /notifications/unread-count`, `GET /notifications/preferences`, `PATCH /notifications/preferences`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `DELETE /notifications/:id` | **The event-bus sink for 8 modules.** Handlers live in `modules/notifications/events/`. ⛔ **Corrected:** this row previously said "9 routes incl. `unread/count`, `unread-count`, `preferences`, `read-all` (both `PATCH` and `PUT`)". Both `unread/count` and `PUT /read-all` have been **removed**; the surviving paths are `unread-count` and `PATCH read-all`, and the controller registers **8** routes, not 9 |
| **Messages** | conversations, messages, **`PATCH /messages/:messageId/read`** | Socket.IO gateway + Redis adapter. ⛔ **Corrected:** this row previously said `PATCH /messages/messages/:messageId/read` and called the doubled segment "real". It was real, and it was a defect: the base `messages` plus the route segment `messages/:messageId/read` meant only the doubled path resolved, so per-message read receipts were unreachable over HTTP. The redundant prefix is dropped — see the comment at `messages.controller.ts:106-124`. `PATCH /messages/conversations/:conversationId/read` (mark the whole conversation) is a different route and cannot shadow it |
| **ReadingProgress** | 5 routes under `/reading-progress` | ⛔ absent from the previous version. Consumes `book.*` events |
| **Users / Badges** | see Identity above | — |

---

### Business — 6

#### Books Module
**Responsibility:** book catalogue, sales, and rental initiation.

**Depends On:** `IBooksRepository`, `IUsersRepository`, **`PaymentsService` directly**, and the
`books` cache tag.

**Events Published:** `book.created`, `book.updated`, `book.published`, `book.archived`,
`book.deleted`

**Events Consumed:** none

⚠️ Corrections:
- `book.purchased` / `book.rented` — ⛔ **neither event exists.** The real ones are
  `book.purchased` → nope: the emitted names are `book.created`, `book.updated`, `book.published`,
  `book.archived`, `book.deleted`. Purchase and rental emit from the **Payments** and **Rentals**
  modules: `payment.completed`, `rental.created`, `rental.extended`, `rental.returned`,
  `rental.expired`, `library.item.added`
- "User library tracking" — ⚠️ the `library` table is owned by the **Library module**, not Books
- "Consumes `payment.completed` → grant access" — ⚠️ true, but that is the **Library** module's
  subscription, not Books'

#### Contests Module
**Responsibility:** contest lifecycle, submissions, voting, winners, and prizes.

**Depends On:** `IContestsRepository`, `IUsersRepository`.

⛔ **"Payments Module (prizes)" is false** — Contests has **no Payments import**. Prizes are rows in
`contest_prizes`; there is no automated payout.

**Events Published:** `contest.created`, `contest.updated`, `contest.started`, `contest.cancelled`,
`contest.completed`, `submission.submitted`, `submission.approved`, `submission.rejected`,
`vote.cast`, `winner.selected`, `prize.distributed`

⚠️ `contest.ended` — ⛔ does not exist. The real terminal events are `contest.completed` and
`contest.cancelled`.

#### Payments Module
**Responsibility:** Paymob integration, webhook handling, refunds, transaction history.

**Depends On:** `IPaymentsRepository`, `IUsersRepository`, `PaymobClient` → `ResilientHttpClient`.

**Events Published:** `payment.created`, `payment.completed`, `payment.failed`, `refund.created`,
`refund.completed`

⚠️ Corrections:
- `refund.processed` — ⛔ does not exist. The real names are `refund.created` and `refund.completed`
- "Revenue tracking" — ⛔ **not implemented.** There is no revenue dashboard or report
- "Depends on Contests Module (prizes)" — ⛔ false; the dependency runs the other way and not at all
- "Valkey (transaction state)" — ⚠️ Valkey caches payments for 300s and stores the **Paymob auth
  token**; the authoritative transaction state is PostgreSQL

#### Moderation Module
**Responsibility:** reporting, moderation actions, user restrictions, admin dashboard.

**Depends On:** `IUsersRepository`; owns the content-moderation service and the escalation
scheduler.

**Events Published:** `moderation.report.created`, `moderation.report.escalated`,
`moderation.action.taken`, `user.restricted`

⚠️ Corrections:
- `content.reported` — ⛔ does not exist. The real name is `moderation.report.created`
- "Depends on Stories Module / Comments Module (content)" — ⚠️ reports are **polymorphic**: a report
  stores `target_id` + `target_type`, not a foreign key to either table. The dashboard reads
  across targets without a module dependency
- `GET /moderation/stats` requires `@Secured(ADMIN) + @RequireAdminRole(SUPER_ADMIN)`. Before
  `@Secured()` existed, this route was readable by **any authenticated user**

#### Library / Rentals — ⛔ absent from the previous version
| Module | Responsibility | Routes |
|---|---|---|
| **Library** | Purchases + rentals for a user; the access grant | `POST/GET /library`, `GET /library/count`, `POST /library/:id/access`, `DELETE /library/:id` |
| **Rentals** | Rental lifecycle, extensions, expiry, overdue list | `POST /rentals`, `GET /rentals`, `/my`, `/:id`, `POST /:id/extend`, `POST /:id/return`, `GET /overdue` |

`Library` consumes `payment.completed` and `rental.*`; `Rentals` publishes
`rental.created`, `rental.extended`, `rental.returned`, `rental.expired`, and
`library.item.added` / `library.item.accessed` / `library.item.removed`.

---

### ⛔ Modules the previous version of this document implied that do not exist

| Implied | Reality |
|---|---|
| **Series Module** | ⛔ No series, collection, or anthology entity in `backend/src/modules/` or in the 33-table schema |
| **Playlists Module** | ⛔ No playlist table, route, or service |
| **Library inside Books** | ⚠️ It is its own module, `LibraryModule` |

---

## Shared Kernel

| Component | Reality |
|---|---|
| **Database Service** | ✅ The `pg` Pool + Drizzle. ⚠️ it is a **module-level singleton**, not injectable — the reason 26 files across 18 modules import `src/db/index.ts` directly, and the reason the e2e suite needs a cloned database per test file |
| **Cache Service** | ✅ `TaggedCacheService` — cache-aside with tag invalidation, `STORY`/`BOOK` 600s, `PAYMENT` 300s, default 3600s |
| **Rate Limiter** | ✅ `ValkeyThrottlerStorage` over **5** tiers (`default`, `auth`, `session`, `upload`, `search` — `THROTTLE_TIER_NAMES` in `throttle.config.ts:4`). ⛔ **Corrected:** this line previously said **4 tiers**; there have been five since the `session` tier was added, and the file’s own comment on `THROTTLE_TIER_NAMES` warns that "all five tiers run" for an undecorated route. Fail-open. Was described here as "Cache Service → rate limiting"; it is a separate, dedicated store |
| **Event Bus** | ✅ EventEmitter2 with a schema registry, a validator, and a **dead letter queue**. 55 event names |
| **Logger Service** | ✅ Winston, with correlation IDs threaded from the WAF middleware. ⚠️ `winston.createLogger` is called with no `level`, so `debug()` and `verbose()` are discarded |
| **WAF Middleware** | ✅ **35** typed rules in 8 layers, every one `enabledByDefault: true` (⛔ this line previously said **34**, contradicting §#15 of `docs/01_ARCHITECTURE_PRINCIPLES.md` and `backend/src/common/waf/rules.ts`), a Valkey-backed IP blocklist, `X-Waf-*` and `X-RateLimit-*` headers. ⚠️ **no admin operations endpoints and no metrics endpoint** |
| **Observability** | ✅ `@sentry/nestjs@11.1.0` via `common/observability/sentry.config.ts`; `GET /api/v1/metrics/cache` |

---

## Module Dependency Rules — ⚠️ 2 of 3 hold

### ✅ Rule 1: Modules may depend on the Shared Kernel, never the reverse
Holds. `common/*` imports no feature module.

### ⚠️ Rule 2: No direct database access across modules

The rule is right and it is **partially** followed.

```typescript
// ✅ GOOD — inverted through an interface
const user = await this.usersRepository.findById(userId);

// ❌ BAD — and it happens
import { db } from '../../db/index.ts';
const user = await db.query.users.findFirst(...);
```

**Measured:** 18 `I*Repository` interfaces exist across 17 files, but **26 files in 18 modules**
import `db/index.ts` directly — `messages.service.ts`, `stories.service.ts`,
`moderation.service.ts`, `admin-dashboard.service.ts`, and others. There is no lint rule, no
architecture test, and no CI gate enforcing this. It is a convention, not an enforced boundary.

### ⚠️ Rule 3: No direct service calls across modules

**One deliberate exception exists**, and it is justifiable:

```typescript
// backend/src/modules/books/books.service.ts:201
const payment = await this.paymentsService.paymobInitializePayment(...)
```

Books needs the checkout URL **before** it can respond, so the call cannot be deferred to an event.
This is the only cross-module service injection found.

⚠️ Note the previous version's "GOOD" example is not what the code does either: it shows
`this.eventBus.publish(new StoryCreatedEvent(...))`, whereas the real call is
`this.eventBus.emit('story.created', {...} as StoryCreatedEvent)` — a dotted string plus a
structural cast, consumed via `@OnEvent('story.created')`. There is **no `publish`** method, no
`IEventBus` interface, and no `subscribe` method.

---

## Communication Patterns

### Synchronous
Controller → Guard → Pipe → Service → Repository → Database, with the `WafMiddleware` and
`ThrottlerGuard` upstream and `AllExceptionsFilter` + `LoggingInterceptor` downstream.

### Asynchronous — ✅ the primary cross-module channel
**55 event names** · 10 definition files in `common/events/` · **72 `@OnEvent` handlers** under
`modules/*/events/` · a schema registry · a validator · a **dead letter queue**.

Non-critical work — notifications, library access grants, reading progress, prize distribution,
Sanity sync — flows through here. A handler that throws does not lose the event; it lands in the DLQ.

---

## New Joiner Guide

### Adding a feature
1. **Identify the owning module** — which module owns this data? (18 modules own at least one table)
2. **Write the `I*Repository` interface** in `modules/<name>/interfaces/`
3. **Publish an event** rather than calling another module's service — `emit('entity.action', payload)`
4. **Register the event name and its Zod schema** in `common/events/event-schema-registry.ts`, or the
   validator will reject your payload
5. **Add a consumer** in `modules/<consumer>/events/`
6. **Register the module** in `backend/src/app.module.ts` — 23 modules are imported there and nothing
   auto-registers

### Reading a module
1. This document for the responsibility
2. `<name>.module.ts` for the Nest wiring
3. `<name>.service.ts` for the business logic
4. `<name>.repository.ts` (or `repositories/`) for data access
5. ⚠️ There is **no per-module `README.md`**, despite the previous version of this document telling
   new joiners to read one. The exception is `modules/search/README.md`.

---

## Dependency Resolution: the Auth ↔ Users Question

**Problem:** Auth must look up a user during authentication; Users must react to registration.

**Solution, as implemented:**
- Auth injects the **shared** `IUsersRepository` from `backend/src/common/users/users-repository.interface.ts`
  — it does **not** import `UsersModule`
- `UsersModule` consumes `user.registered`; `AuthModule` consumes nothing
- Communication is one-directional

⚠️ One correction: `IUsersRepository` is **not read-only from Auth's perspective**. It exposes
`create`, `update`, and `softDelete` alongside the six `findBy*Id` lookups, and `AuthService` uses
`create` during registration and `update` to set `passwordResetToken` / `emailVerificationToken`. So
the "read-only dependency" claim in the previous version is **false** — the repository is shared and
mutably used, which is a wider coupling than the boundary rule intends.

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality |
|---|---|
| Auth: "Session creation and revocation"; Cache (session storage) | ⛔ **No session store exists.** Valkey holds the refresh-token blacklist |
| Auth events `user.logged_in` / `user.logged_out` | ⛔ **Neither exists** |
| Users event `user.verified` | ⛔ Does not exist. Verification emits `email.verification.requested` / `email.verified` |
| `POST /users/:id/verify` | ⛔ Does not exist. Real: `POST /users/me/verification` + `POST /users/verification/confirm` |
| `POST /users` and `DELETE /users/:id` not mentioned | ✅ **Both now exist**, super-admin only |
| Search "Depends on Stories Module, Users Module" | ⚠️ No such imports. Stories and Search are independent |
| Follows at `/users/:id/follow`; Reactions at `/stories/:id/reactions`; Comments at `/stories/:id/comments` | ⚠️ Real bases are `/follows`, `/reactions/stories/:storyId`, `/comments` |
| Upload implied `/upload/image-url` | ⚠️ Real: `POST /upload/image`, `POST /upload/pdf` |
| Books events `book.purchased`, `book.rented` | ⛔ Neither is emitted by Books. Purchase/rental events come from Payments and Rentals |
| Books "User library tracking" and "consumes `payment.completed`" | ⚠️ Both belong to the **Library** module |
| Contests event `contest.ended` | ⛔ Does not exist. Terminal events are `contest.completed` / `contest.cancelled` |
| Contests "Depends on Payments Module (prizes)" | ⛔ **False.** No Payments import; no automated payout |
| Payments event `refund.processed` | ⛔ Does not exist. Real: `refund.created`, `refund.completed` |
| Payments "Revenue tracking" | ⛔ **Not implemented** |
| Payments "Valkey (transaction state)" | ⚠️ Valkey caches payments and holds the Paymob auth token; PostgreSQL is authoritative |
| Moderation event `content.reported` | ⛔ Real name is `moderation.report.created` |
| Moderation "Depends on Stories/Comments (content)" | ⚠️ Reports are **polymorphic** (`target_id` + `target_type`), not FKs |
| **Series / Playlists** | ⛔ Neither module exists. Added ⛔ **Badges, Library, Rentals, ReadingProgress, Categories, Tags, Upload, Search, SharedCache, Database** |
| Event bus "planned" | ✅ **Shipped.** 55 events, 10 definition files, 72 `@OnEvent` handlers, a registry, a validator, a DLQ |
| `this.eventBus.publish(new StoryCreatedEvent(...))` / `IEventBus.subscribe` | ⛔ No `publish`, no `IEventBus`, no `subscribe`. Real: `emit('story.created', payload as StoryCreatedEvent)` + `@OnEvent` |
| "No direct database access across modules" | ⚠️ **PARTIAL.** 26 files in 18 modules import `db/index.ts` directly; no enforcement mechanism |
| "No direct service calls" | ⚠️ **PARTIAL.** One deliberate exception: `BooksService → PaymentsService` |
| "Auth → Users is a read-only repository dependency" | ⚠️ **False.** Auth uses `create` and `update` through the shared repository |
| "Read the module's README.md" | ✅ **There are 25 of them.** `find backend/src -name README.md` returns 25 files, including one per module (`modules/auth/README.md`, `modules/books/README.md`, … `modules/search/README.md`) plus `common/guards`, `common/waf`, `common/throttler`, `common/observability`, `db/migrations`, `modules/shared/cache` and `modules/email-verification`. ⛔ This row previously claimed "Per-module READMEs do not exist (only `modules/search/README.md`)" |
| Shared Kernel: rate limiting under "Cache Service" | ✅ Real, but it is a dedicated `ValkeyThrottlerStorage`, not the cache |
| — | **New:** the 4-tab frontend/backend route mismatches (comments, reactions, follows, upload, moderation) recorded in `api-contract/openapi/rest-api-spec.md` |

---

*This document is the C4 component view of the Hakawi modules. For the full inventory, route map,
and dependency graph, see
[`docs/module-boundaries/overview/module-boundaries.md`](../../module-boundaries/overview/module-boundaries.md).*
