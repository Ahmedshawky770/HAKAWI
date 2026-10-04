# Module Boundaries
## Hakawi - Module Contracts and Dependencies

Reconciled against `backend/src/app.module.ts` and `backend/src/modules/**` on 2026-09-30.

Status markers: ✅ as described · ⚠️ partial / drifted · ⛔ does not exist.

---

## Module Organization

Hakawi is a **modular monolith** where each business domain is encapsulated in its own Nest module.
Modules communicate through the event bus, module-owned repository interfaces, and a small number
of deliberate direct service calls.

---

## Registered Modules — 23

`backend/src/app.module.ts` imports exactly **23** modules. This is the authoritative list.

```mermaid
graph TB
    subgraph "Infrastructure"
        Database[DatabaseModule]
        Common[CommonModule<br/>guards, filters, WAF, throttler,<br/>resilience, events, Valkey]
        SharedCache[SharedCacheModule<br/>@Global TaggedCacheService]
    end

    subgraph "Identity"
        Auth[AuthModule]
        Users[UsersModule]
        Badges[BadgesModule]
    end

    subgraph "Content"
        Stories[StoriesModule]
        Categories[CategoriesModule]
        Tags[TagsModule]
        Search[SearchModule]
        Upload[UploadModule]
    end

    subgraph "Social"
        Follows[FollowsModule]
        Reactions[ReactionsModule]
        Comments[CommentsModule]
        Notifications[NotificationsModule]
        Messages[MessagesModule]
        ReadingProgress[ReadingProgressModule]
    end

    subgraph "Commerce"
        Books[BooksModule]
        Library[LibraryModule]
        Rentals[RentalsModule]
        Payments[PaymentsModule]
        Contests[ContestsModule]
    end

    subgraph "Governance"
        Moderation[ModerationModule]
    end

    Database --> Auth
    Database --> Users
    Database --> Stories
    Database --> Books
    Database --> Payments
    Database --> Contests
    Database --> Moderation

    Common --> Auth
    Common --> Users
    Common --> Stories
    Common --> Books
    Common --> Payments
    Common --> Contests
    Common --> Moderation

    SharedCache --> Stories
    SharedCache --> Books
    SharedCache --> Payments

    Auth --> Users
    Users --> Stories
    Users --> Books
    Users --> Payments
    Users --> Contests
    Stories --> Books
    Books --> Payments
    Books --> Notifications
    Payments --> Notifications
    Contests --> Notifications
    Moderation --> Notifications
    Comments --> Notifications
    Reactions --> Notifications
    Follows --> Notifications
    Messages --> Notifications
```

### ⛔ Modules the previous version of this graph contained that do not exist

| Module | Reality |
|---|---|
| **Series** | ⛔ **Never built.** There is no series, collection, or anthology entity in `backend/src/modules/` or in the 33-table schema. "Texties" appears in the account-type descriptions but there is no module |
| **Playlists** | ⛔ **Never built.** No playlist table, no route, no service |

### ✅ Modules missing from the previous graph

| Module | Purpose |
|---|---|
| **Badges** | Badge catalogue and awards. Tables `badges` / `user_badges`, routes `GET /api/v1/badges`, plus a super-admin award endpoint (`backend/src/modules/badges/badges.controller.ts:30`) |
| **SharedCache** | `@Global()` module exporting `TaggedCacheService`, the cache-aside/tag-invalidation implementation (`backend/src/modules/shared/cache/shared-cache.module.ts`) |
| **Categories** | Category tree, including the self-referencing `parent_id` sub-category structure |
| **Tags** | Tag catalogue; the join tables `story_tags` and `book_tags` are declared here |
| **Upload** | Presigned S3 URL generation for images and PDFs, plus the `uploads` table |
| **ReadingProgress** | Per-user, per-book reading position; consumes `book.*` events |
| **Library** | Purchases + rentals for a user; consumes `payment.completed` and `rental.*` |
| **Rentals** | Rental lifecycle, extensions, expiry |
| **Search** | PostgreSQL full-text search over stories, plus the `search` tier of rate limiting |
| **Database** | The `pg` Pool and the Drizzle instance |
| **Common** | Every cross-cutting primitive: `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`, `RestrictionGuard`, `OwnershipGuard`, `AllExceptionsFilter`, `LoggingInterceptor`, `CacheInterceptor`/`CacheMetrics`, `WafMiddleware`, `ValkeyThrottlerStorage`, the event bus with its schema registry and DLQ, the resilience module, Sentry, and `TaggedCacheService`. `@Secured()` composes **4** guards (`JwtAuthGuard` → `RestrictionGuard` → `RolesGuard` → `PermissionsGuard`); `OwnershipGuard` is per-route via `@UseGuards`, and the newer **`OptionalJwtAuthGuard`** is registered by `StoriesModule` alone (`stories.module.ts:32`) for the two public story-detail routes — it is deliberately not exported. It shares one token-extraction implementation with `JwtAuthGuard` (`common/guards/access-token.ts`), and `AuthRequest.user` stays **required** while a new `OptionalAuthRequest` carries the optional case |

---

## Module Contracts

Routes are shown **without** the `/api/v1` prefix, which `app.setGlobalPrefix('api/v1')` adds
(`backend/src/main.ts:65`).

### Auth Module — `backend/src/modules/auth`

**Purpose:** authentication and token lifecycle.

**Public Interface** (`auth.controller.ts`):
- `POST /auth/register` (:53)
- `POST /auth/login` (:62)
- `POST /auth/refresh` (:71)
- `GET /auth/session` (:80)
- `POST /auth/logout` (:86)
- `POST /auth/forgot-password` (:99)
- `POST /auth/reset-password` (:107)
- `GET /auth/oauth/:provider` (:115)
- `GET /auth/oauth/:provider/callback` (:122) — 5 providers: Google, Apple, Facebook, GitHub, TikTok

⛔ **`POST /auth/mfa` does not exist.** There is no MFA anywhere in the codebase. The requirement is
retained in `docs/security-architecture/auth/auth-overview.md`.

**Dependencies:** the Users repository interface (read/write for user lookup and creation); Valkey
for the refresh-token blacklist and the password-reset TTL; `CircuitBreakerService` for the OAuth
provider calls (`backend/src/modules/auth/auth.service.ts:59`); the encryption util for the reset token.

**Events Published:** `user.registered`, `user.updated`, `password.reset.requested`,
`password.reset.completed`, `email.verification.requested`, `email.verified`

**Events Consumed:** none

**Note:** the previous version said "Auth does NOT depend on Users". That is still true at the
*module* level — Auth imports `IUsersRepository`, not `UsersModule` — but the repository is
`backend/src/common/users/users-repository.interface.ts`, a **shared** contract, so the coupling is
real even though the Nest module graph is clean.

---

### Users Module — `backend/src/modules/users`

**Purpose:** profile, statistics, and the verification workflow.

**Public Interface** (`users.controller.ts`):
- `GET /users/:id/stats` (:38)
- `GET /users/me` (:43)
- `PATCH /users/me` (:48)
- `GET /users/me/verification` (:54)
- `POST /users/me/verification` (:60)
- `POST /users/verification/confirm` (:72)
- `GET /users/:id` (:79)
- `POST /users` (:87) — ✅ **now exists**, `@Secured(AccountType.ADMIN) + @RequireAdminRole(SUPER_ADMIN)`
- `PATCH /users/:id` (:93)
- `DELETE /users/me` (:109)
- `DELETE /users/:id` (:118) — ✅ **now exists**, super-admin only

⛔ **`POST /users/:id/verify` does not exist.** The real verification routes are
`POST /users/me/verification` (request) and `POST /users/verification/confirm` (confirm).

**Dependencies:** `IUsersRepository`; the event bus.

**Events Published:** `user.registered`, `user.updated`, `user.followed`, `user.unfollowed`,
`user.restricted`, `user.online`, `user.offline`, `user.typing`, `email.verification.requested`,
`email.verified`, `password.reset.requested`, `password.reset.completed`

**Events Consumed:** `user.registered` (initialise the user, send the welcome notification)

---

### Stories Module — `backend/src/modules/stories`

**Purpose:** story CRUD, publishing, and Sanity sync.

**Public Interface:** `GET /stories`, `GET /stories/:id`, `POST /stories`,
`PATCH /stories/:id`, `DELETE /stories/:id`, `POST /stories/:id/publish`, plus category and tag
assignment.

**Dependencies:** `IStoriesRepository`, `IUsersRepository`, `ITagsRepository`, `ICategoriesRepository`;
`CircuitBreakerService` for the Sanity call (`stories/sanity/sanity.service.ts`);
`TaggedCacheService` for the `stories` cache tag.

**Events Published:** `story.created`, `story.updated`, `story.published`, `story.archived`,
`story.deleted`, `story.reacted`, `story.reaction.removed`

**Events Consumed:** none

⚠️ **The previous version listed "Notifications Module (notify followers)" as a Stories dependency.**
Notifications are reached through the **event bus**, not by a direct call — which is the whole point
of the boundary rule.

---

### Books Module — `backend/src/modules/books`

**Purpose:** book catalogue, sales, and rentals initiation.

**Public Interface** (`books.controller.ts`): `GET /books`, `GET /books/isbn/:isbn`, `GET /books/:id`,
`POST /books`, `PATCH /books/:id`, `DELETE /books/:id`, `POST /books/:id/publish`,
`POST /books/:id/archive`, `POST /books/:id/download`, `POST /books/:id/purchase`,
`POST /books/:id/rent`

**Dependencies:** `IBooksRepository`; **`PaymentsService` directly** (`backend/src/modules/books/books.service.ts:201` calls
`paymobInitializePayment`); `IUsersRepository`; `TaggedCacheService` for the `books` tag.

**Events Published:** `book.created`, `book.updated`, `book.published`, `book.archived`,
`book.deleted`

**Events Consumed:** none

⚠️ **This is the one real violation of rule 2 ("No Direct Service Calls") in the codebase** — and it
is a reasonable one: initiating a payment is a synchronous use case, and deferring it to an event
would mean Books would have to return before it knew whether the payment was created. It is recorded
here rather than hidden.

---

### Contests Module — `backend/src/modules/contests`

**Purpose:** contest lifecycle, submissions, voting, winners, and prizes.

**Public Interface** (`contests.controller.ts`): `GET /contests`, `GET /contests/:id`,
`POST /contests`, `POST /contests/:id/start`, `/cancel`, `/complete`, `POST /contests/:id/submissions`,
`GET /contests/:id/submissions`, `POST /contests/:id/votes`, `GET /contests/:id/votes`,
`POST /contests/:id/winner`, `POST /contests/:id/submissions/:submissionId/approve`, `/reject`,
`POST /contests/:id/prizes`, `GET /contests/:id/prizes`, and the publisher dashboard:
`GET /contests/publisher/stats`, `GET /contests/publisher/:id/submissions`,
`GET /contests/publisher/:id/votes`

⛔ **The previous version's `POST /contests/:id/submit` and `POST /contests/:id/vote` do not exist.**
The real paths are `POST /contests/:id/submissions` and `POST /contests/:id/votes` (plural). The
publisher dashboard routes the previous version omitted **are** real.

**Dependencies:** `IContestsRepository`; `IUsersRepository`. ⛔ **No Payments dependency** — the
previous version claimed "Payments Module (prizes)". Prizes are recorded in `contest_prizes`; there
is no automated payout and no call into `PaymentsModule`.

**Events Published:** `contest.created`, `contest.updated`, `contest.started`, `contest.cancelled`,
`contest.completed`, `submission.submitted`, `submission.approved`, `submission.rejected`,
`vote.cast`, `winner.selected`, `prize.distributed`

**Events Consumed:** none

---

### Modules not previously documented

| Module | Key routes | Notable dependencies |
|---|---|---|
| **Badges** | `GET /api/v1/badges`, `GET /:userId`, award (super-admin) | `TaggedCacheService`; consumes nothing. ⛔ `badges.service.ts` is one of the 17 repository-adjacent files with the loosest coverage floor (79/88/56/81) |
| **Categories** | `GET/POST/PATCH/DELETE /categories` | `ICategoriesRepository`; self-referencing `parent_id` |
| **Tags** | `GET /tags` | `ITagsRepository`; owns the `story_tags` / `book_tags` join tables |
| **Search** | `GET /api/v1/search` | `ISearchRepository`; the `search` throttle tier (50/min). Input validated by the real `SearchFiltersDto` class |
| **Upload** | `POST /api/v1/upload/image-url`, `/pdf-url` | AWS SDK S3 presigner; the `upload` throttle tier (5/min) |
| **ReadingProgress** | `GET/PUT /api/v1/reading-progress` | `IReadingProgressRepository`; consumes `book.*` events |
| **Library** | `GET /api/v1/library` | `ILibraryRepository`; consumes `payment.completed`, `rental.*` |
| **Rentals** | rentals + extensions | `IRentalsRepository`; consumes `payment.completed` |
| **Follows** | `POST /api/v1/follows` `{followingId}`, `DELETE /api/v1/follows/:followingId`, `GET /api/v1/follows/user/:userId/{followers,following,stats}`, `GET /api/v1/follows/check/:followingId` | `IFollowsRepository`; emits `user.followed` / `user.unfollowed` |
| **Reactions** | `POST/DELETE/GET /api/v1/reactions/stories/:storyId`, `GET /api/v1/reactions/stories/:storyId/counts`, `GET /api/v1/reactions/stories/:storyId/me` | `IReactionsRepository`; emits `story.reacted` |
| **Comments** | `GET /api/v1/comments/story/:storyId`, `GET /api/v1/comments/:id/replies`, `POST /api/v1/comments`, `PATCH/DELETE /api/v1/comments/:id`, `POST/DELETE/GET /api/v1/comments/:commentId/reactions` | `ICommentsRepository`, `ICommentReactionsRepository` |
| **Notifications** | `GET /api/v1/notifications`, unread count, mark read | `INotificationsRepository`; the **sink for most of the event bus** — 8 modules emit into it |
| **Messages** | conversations, messages, `PATCH /:messageId/read` | `IConversationsRepository`, `IMessagesRepository`; Socket.IO gateway + Redis adapter |
| **Moderation** | reports, actions, restrictions, stats, trends | `IUsersRepository`; owns the WAF-facing `content-moderation` service and the escalation scheduler |
| **Payments** | `POST /payments`, `GET /:id`, `PATCH /:id/status`, `POST /:id/refund`, `GET /:id/refunds`, `POST /webhooks/paymob` | `IPaymentsRepository`; `PaymobClient` → `ResilientHttpClient` |
| **Database / Common / SharedCache** | — | Infrastructure; see the graph above |

---

> ⛔ **Corrected — the three Phase-3 rows above (Follows, Reactions, Comments).** They previously
> documented `POST/DELETE /api/v1/users/:id/follow`, `POST/DELETE /api/v1/stories/:id/reactions` and
> `GET/POST /api/v1/stories/:id/comments`. **None of those paths exists.** The controllers are
> `@Controller('follows')`, `@Controller('reactions')` and `@Controller('comments')`, with no
> per-resource path parameter. The paths above are transcribed from
> `follows/controllers/follows.controller.ts`, `reactions/controllers/reactions.controller.ts`,
> `comments/controllers/comments.controller.ts` and
> `comments/reactions/comment-reactions.controller.ts` (which is itself under
> `@Controller('comments')`, so comment reactions are addressed as `/comments/:commentId/reactions`).
> The previous paths were also live in `frontend/src/lib/api.ts`, so every one of those calls was a
> 404 — see `docs/c4-model/component/module-boundaries.md`, which had already flagged the mismatch.

---

## Module Boundaries Rules — ⚠️ 3 of 6 hold

| # | Rule | Status | Evidence |
|---|---|---|---|
| 1 | **No Direct Database Access** — modules use repositories only | ⚠️ **PARTIAL** | 18 repository interfaces exist across 17 files, but **26 files across 18 modules import `src/db/index.ts` directly** (`messages.service.ts`, `stories.service.ts`, `moderation.service.ts`, `admin-dashboard.service.ts`, …). The `Repository` pattern is applied inconsistently |
| 2 | **No Direct Service Calls** — use events or public interfaces | ⚠️ **PARTIAL** | The event bus carries **55 event names** and is the primary channel, but there are deliberate direct service injections: `Books → PaymentsService`, plus `IUsersRepository` shared from `common/users/` |
| 3 | **No Shared State** — each module owns its data | ⚠️ **PARTIAL** | `stories` is read by Stories, Contests, Moderation, Search, Upload and Messages; `users` by 12 modules. The `users` table is the most-shared entity in the system |
| 4 | **Explicit Contracts** — public interfaces are versioned | ⚠️ **PARTIAL** | 18 `I*Repository` interfaces exist, but ⛔ **none of them is versioned**, and no `IUsersService` / `IStoriesService` service-level interface exists. ⛔ `IStoriesRepository` has **no second implementation** — there is one Drizzle implementation, so the interface buys testability, not substitutability |
| 5 | **Event-Driven** — cross-module communication via events | ✅ **HOLDS** | 55 event names, 10 event definition files under `common/events/`, 72 `@OnEvent` handlers under `modules/*/events/`, a schema registry, a validator, and a dead letter queue |
| 6 | **Auth/Users separation** — Auth reads Users only through the repository, never the service; Users listens to Auth events | ✅ **HOLDS** | Auth imports `IUsersRepository`; there is no `Auth → UsersModule` import in the module graph |

---

## Event-Driven Communication — ✅ real

The previous version of this document said the event registry was "planned". **It shipped early**,
during Phases 1–2, together with the DLQ. See `docs/adr/004-use-event-emitter2.md`.

- **55 event names** across 10 definition files in `backend/src/common/events/`
- **72 `@OnEvent` handlers** under `backend/src/modules/*/events/`
- `event-schema-registry.ts` — one registered schema per event, with versioning
- `event-validator.service.ts` — a handler receiving a schema-invalid event is rejected
- `dlq.service.ts` — an event whose handler throws is captured, not lost

See **`module-boundaries/events/event-schema-registry.md`** for the contract definitions.

---

## Related Documentation

- **Module contracts:** `module-boundaries/contracts.md` ⚠️ and its near-duplicate
  `module-boundaries/contracts/module-contracts.md` — **neither is marked canonical**
- **Module dependencies:** `module-boundaries/dependencies/dependency-rules.md` ⚠️ and its near-duplicate
  `module-boundaries/dependency-rules.md`
- **Module interfaces:** `module-boundaries/interfaces.md` ⚠️ and its near-duplicate
  `module-boundaries/interfaces/shared-interfaces.md`
- **Event Schema Registry:** `module-boundaries/events/event-schema-registry.md`
- **Payment System:** `module-boundaries/payments/payment-system.md` ✅
- **Architecture Principles:** `01_ARCHITECTURE_PRINCIPLES.md` ✅

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality |
|---|---|
| **Series Module** in the dependency graph | ⛔ **Does not exist.** No series, collection, or anthology anywhere in `backend/src` or the schema |
| **Playlists Module** in the dependency graph | ⛔ **Does not exist.** No playlist table, route, or service |
| 8 modules in the graph | **23 registered modules** in `app.module.ts` |
| — | **Added to the graph:** Badges, SharedCache, Categories, Tags, Search, Upload, ReadingProgress, Library, Rentals, Follows, Reactions, Comments, Messages, Notifications, Moderation, Database |
| `POST /auth/mfa` | ⛔ **Does not exist.** No MFA in the codebase |
| `POST /users/:id/verify` | ⛔ **Does not exist.** Real: `POST /users/me/verification` + `POST /users/verification/confirm` |
| Missing from the Users contract | ✅ **`POST /users` and `DELETE /users/:id` now exist** (super-admin only) — the roadmap item that was previously listed as open |
| Missing from the Auth contract | ✅ `forgot-password`, `reset-password`, `oauth/:provider`, `oauth/:provider/callback` |
| `POST /contests/:id/submit`, `POST /contests/:id/vote` | ⛔ Wrong paths. Real: `POST /contests/:id/submissions`, `POST /contests/:id/votes` |
| Publisher dashboard not mentioned | ✅ Real: `GET /contests/publisher/stats`, `/publisher/:id/submissions`, `/publisher/:id/votes` |
| Contests "Dependencies: Payments Module (prizes)" | ⛔ **False.** No Payments import. Prizes are rows in `contest_prizes`; there is no automated payout |
| "The registry contains 30+ event schemas … planned for Phase 7" | ✅ **Shipped.** **55 event names**, 10 definition files, 72 `@OnEvent` handlers, a schema registry, a validator, and a DLQ |
| "No Direct Database Access — modules use repositories only" | ⚠️ **PARTIAL.** 18 repository interfaces exist, but 26 files across 18 modules import `src/db/index.ts` directly |
| "No Direct Service Calls" | ⚠️ **PARTIAL.** The event bus is primary, but `Books → PaymentsService` is a deliberate direct call |
| "Public interfaces are versioned" | ⚠️ **PARTIAL.** 18 `I*Repository` interfaces exist; **none is versioned**, and no `IUsersService` / `IStoriesService` exists |
| "Auth does NOT depend on Users" | ✅ Still true at the module level, but Auth imports the **shared** `IUsersRepository` from `common/users/`, so the coupling is real |
| "Stories → Notifications (notify followers)" | ⚠️ Indirect via the event bus, not a direct call |

---

*This document defines the module boundaries for Hakawi.*
