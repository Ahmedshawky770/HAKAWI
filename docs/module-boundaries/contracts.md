# Module Contracts
## Hakawi Module Boundaries

The contracts and interfaces between modules in the Hakawi platform.

Reconciled against `backend/src/common/users/users-repository.interface.ts`,
`backend/src/modules/**/interfaces/*-repository.interface.ts`, and
`backend/src/common/events/*.events.ts` on 2026-09-30.

> ⚠️ **This document has a near-duplicate at `module-boundaries/contracts/module-contracts.md`, and
> neither file is marked canonical.** They can drift apart silently. The same is true of
> `module-boundaries/interfaces.md` vs `interfaces/shared-interfaces.md`, and
> `module-boundaries/dependency-rules.md` vs `dependencies/dependency-rules.md`.

Status markers: ✅ as described · ⚠️ partial / drifted · ⛔ does not exist.

---

## Contract Principles

| Rule | Status | Reality |
|---|---|---|
| 1. **Interface Segregation** — small, focused interfaces | ✅ | 18 `I*Repository` interfaces, each scoped to one table or table group |
| 2. **Dependency Inversion** — depend on abstractions | ⚠️ | The repository layer is inverted. **The service layer is not** — see the note below |
| 3. **Explicit Dependencies** — all dependencies declared | ⚠️ | 18 repository interfaces are declared; 26 files across 18 modules import `src/db/index.ts` directly |
| 4. **Versioned APIs** — backward compatibility maintained | ⛔ **NOT IMPLEMENTED** | No `I*Repository` interface carries a version. `IStoriesRepository` has one implementation and no substitutability behind it. ⛔ **Corrected:** the row previously merged the Status and Reality columns into one cell, which left the table with three columns against a four-column header and shifted every cell left when rendered |
| 5. **Event-Driven** — async communication via events | ✅ | 55 event names, 10 definition files, 72 `@OnEvent` handlers, a schema registry, a validator, and a DLQ |

### ⚠️ There are no service-level interfaces

The previous version of this document defined `IUsersService`, `IStoriesService`, `IFollowsService`,
`IReactionsService`, `ICommentsService`, `INotificationsService`, `IBooksService` and
`IPaymentsService`. **None of them exists.**

```bash
grep -rhoE "export (interface|abstract class) I[A-Za-z]+" --include='*.ts' backend/src/
# → IBooksRepository, ICategoriesRepository, ICommentReactionsRepository, ICommentsRepository,
#   IContestsRepository, IConversationsRepository, IFollowsRepository, ILibraryRepository,
#   IMessagesRepository, INotificationsRepository, IPaymentsRepository, IReactionsRepository,
#   IReadingProgressRepository, IRentalsRepository, ISearchRepository, IStoriesRepository,
#   ITagsRepository, IUsersRepository
```

Every `I*` in the codebase is a **repository** interface. Services are concrete Nest providers
injected by class, so a service cannot be substituted by a test double without `overrideProvider`
or a module mock. The repository interfaces buy real testability; the service contracts are absent.

---

## Repository Contracts — the real ones

### `IUsersRepository`
`backend/src/common/users/users-repository.interface.ts` — **shared**, not owned by `UsersModule`.
This is what lets `AuthModule` read and create users without importing `UsersModule`.

```typescript
interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  findByFacebookId(facebookId: string): Promise<User | null>;
  findByTwitterId(twitterId: string): Promise<User | null>;
  findByGithubId(githubId: string): Promise<User | null>;
  findByAppleId(appleId: string): Promise<User | null>;
  findByTiktokId(tiktokId: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
  softDelete(id: string): Promise<void>;
}
```

| Previous claim | Reality |
|---|---|
| `delete(id): Promise<void>` | **`softDelete(id)`** — a hard delete is not exposed. Matches the 7-table soft-delete design |
| `findMany(filters)` / `count(filters)` | ⛔ **Not on the interface.** The module uses Drizzle query composition for those instead |
| `verifyEmail(token)` / `requestPasswordReset(email)` / `resetPassword(...)` / `changePassword(...)` | ⛔ **None are repository methods.** They live on `UsersService` and write through the AES-encrypted `password_reset_token` / `email_verification_token` columns via `update()` |
| — | **Six `findBy*Id` OAuth lookups are the real shape** — one per provider, matching the six `*_id` columns on `users` |

### `IStoriesRepository`
`backend/src/modules/stories/interfaces/stories-repository.interface.ts`

```typescript
interface IStoriesRepository {
  findById(id: string): Promise<Story | null>;
  findBySlug(slug: string): Promise<Story | null>;
  findAll(filters: StoryFilters): Promise<{ stories: Story[]; total: number }>;
  create(data: CreateStoryData): Promise<Story>;
  update(id: string, data: Partial<Story>): Promise<Story>;
  softDelete(id: string): Promise<void>;
  incrementViewCount(id: string): Promise<void>;
  findAuthorsByIds(ids: string[]): Promise<User[]>;
  findCategoriesByIds(ids: string[]): Promise<Category[]>;
  findTagsByStoryIds(storyIds: string[]): Promise<Tag[]>;
}
```

| Previous claim | Reality |
|---|---|
| `findByAuthorId(authorId): Promise<Story[]>` | ⛔ Not a method. Author filtering is part of `findAll(filters)` |
| `findByCategory(category): Promise<Story[]>` | ⛔ Not a method. `findAll` handles it |
| `search(query)` | ⛔ Not here. Full-text search is `ISearchRepository` in the **Search module** — a different module, so Stories does not own it |
| `publish` / `unpublish` / `incrementViews` | ⚠️ `incrementViewCount` **is** real. `publish`/`unpublish` are **not** repository methods — they are `update()` calls that set `status` and `published_at` |
| — | **New and load-bearing:** `findAuthorsByIds`, `findCategoriesByIds`, and `findTagsByStoryIds` exist to **avoid the N+1 problem** on list endpoints — one batched query per related entity instead of one per story |

### `INotificationsRepository`
`backend/src/modules/notifications/interfaces/notifications-repository.interface.ts`

```typescript
interface INotificationsRepository {
  findById(id: string): Promise<Notification | null>;
  findByUser(userId: string, page: number, limit: number): Promise<{ items: Notification[]; total: number }>;
  findUnread(userId: string): Promise<Notification[]>;
  create(data: CreateNotificationData): Promise<Notification>;
  markAsRead(id: string, userId: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
  countUnread(userId: string): Promise<number>;
  findPreferences(userId: string): Promise<NotificationPreferences | null>;
  upsertPreferences(userId: string, data: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
}
```

⚠️ `findPreferences` / `upsertPreferences` mean the interface spans **two** tables —
`notifications` and `notification_preferences`. So "each module owns one table" is not strictly
true, even at the repository level.

### The other 15 repository interfaces
`IBooksRepository`, `ICategoriesRepository`, `ICommentReactionsRepository`, `ICommentsRepository`,
`IContestsRepository`, `IConversationsRepository`, `IFollowsRepository`, `ILibraryRepository`,
`IMessagesRepository`, `IPaymentsRepository`, `IReactionsRepository`, `IReadingProgressRepository`,
`IRentalsRepository`, `ISearchRepository`, `ITagsRepository` — one per file under
`backend/src/modules/**/interfaces/`.

⛔ **None has a second implementation.** They are inversion points for test doubles, not pluggable
strategies.

---

## Events — the real shapes

The previous version defined rich event classes with `timestamp: Date` and a `type` discriminator.
**No event carries a `timestamp`.** The real classes are minimal positional records
(`backend/src/common/events/stories.events.ts`):

```typescript
export class StoryCreatedEvent {
  constructor(
    public readonly storyId: string,
    public readonly authorId: string,
  ) {}
}

export class StoryUpdatedEvent {
  constructor(
    public readonly storyId: string,
    public readonly updatedFields: Record<string, unknown>,
  ) {}
}

export class StoryPublishedEvent {
  constructor(
    public readonly storyId: string,
    public readonly publishedAt: Date,
  ) {}
}

export class StoryArchivedEvent {
  constructor(public readonly storyId: string) {}
}

export class StoryDeletedEvent {
  constructor(
    public readonly storyId: string,
    public readonly authorId: string,
  ) {}
}
```

### ⚠️ How events are actually emitted — and why it matters

```typescript
// backend/src/modules/stories/stories.service.ts:197
await this.eventBus.emit('story.published', { storyId: id, publishedAt } as StoryPublishedEvent);
```

The event is a **dotted string** with a **structural object cast to the class type**. The classes
carry no behaviour, are never `instanceof`-checked, and the `as` cast means TypeScript cannot verify
the payload shape. There is **no `EventBus` class and no `EventBusModule`** — `CommonModule` calls `EventEmitterModule.forRoot(...)` directly
(`backend/src/common/event-bus.module.ts:24`), and consumers subscribe with `@OnEvent('story.published')`
on the raw string.

The previous version's `EventBus` class with `emit(event: Event)` / `on(eventType, handler)` **does
not exist**, and the `new StoryPublishedEvent({...})` object-literal call style shown there does not
match any call site in the codebase.

⚠️ The real safety net is `event-schema-registry.ts` + `event-validator.service.ts`: a registered
Zod schema per event name, validated on publish. That is what compensates for the untyped cast — but
it is a runtime check, so a payload that drifts from its class is only caught in production if the
registry schema was also updated.

### Event names by module — all 53
`book.*` (5) · `comment.*` (4) · `contest.*` (5) · `email.*` (2) · `library.*` (3) ·
`message.*` (4) · `moderation.*` (3) · `notification.*` (1) · `password.*` (2) · `payment.*` (4) ·
`prize.*` (1) · `refund.*` (2) · `rental.*` (4) · `story.*` (6) · `submission.*` (3) ·
`user.*` (5) · `vote.cast` (1) · `winner.selected` (1)

⚠️ The previous version's `UserDeletedEvent`, `StoryArchivedEvent` naming aside, **`user.deleted`
does not exist** — `IUsersRepository.softDelete` writes a column and emits no event.
`NotificationReadEvent` also does not exist; read state is a `PATCH` that writes `is_read`.

---

## Cross-Module Communication

### Event-Driven — ✅ the primary channel
Every module publishes through the event bus; `NotificationsModule` is the sink for 8 modules'
events, and `UsersModule` is the sink for `user.registered`.

### Direct Service Calls — ⚠️ real, and previously undocumented

The one deliberate synchronous cross-module call:

```typescript
// backend/src/modules/books/books.service.ts:201
const payment = await this.paymentsService.paymobInitializePayment(...)
```

`BooksService` injects `PaymentsService` **by class**. A payment must be created before the purchase
response can be returned, so deferring it to an event would leave the caller without a checkout URL.
This is a justified exception, and it is the reason rule 2 is marked PARTIAL rather than broken.

⚠️ The previous version's `NotificationsService` example — injecting `IUsersService` and
`IStoriesService` to look up a story and its author on publish — is **not how notifications are
built**. Notifications are created by event handlers in
`backend/src/modules/notifications/events/`, which receive the event payload directly and perform no
reverse service lookups.

---

## API Contracts

⚠️ Full REST contract: see `api-contract/openapi/rest-api-spec.md` and
`api-contract/error-handling.md`. What follows is the delta against the previous version.

### Auth
```typescript
// POST /api/v1/auth/register
Request:  { email, password, name, username }
Response: AuthTokens-shaped body + both tokens also set as httpOnly cookies

// POST /api/v1/auth/login
Response: same; the access token is ALSO read from the Authorization header by JwtAuthGuard
```

### Users
```typescript
// GET  /api/v1/users/:id          → { user }
// PATCH /api/v1/users/me          → { user }
// PATCH /api/v1/users/:id         → super-admin only, not PUT
// DELETE /api/v1/users/me         → self-delete, soft
// DELETE /api/v1/users/:id        → super-admin only, soft   ✅ NOW EXISTS
// POST  /api/v1/users             → super-admin only         ✅ NOW EXISTS
// POST  /api/v1/users/me/verification            ⛔ not POST /users/:id/verify
// POST  /api/v1/users/verification/confirm
```

| Previous claim | Reality |
|---|---|
| `POST /users/:id/verify` | ⛔ **Does not exist.** Real: `POST /users/me/verification` and `POST /users/verification/confirm` |
| `PUT /users/:id` | ⚠️ The route is `PATCH /users/:id` |
| No `POST /users` or `DELETE /users/:id` | ✅ **Both now exist**, super-admin only |

### Stories
```typescript
// GET /api/v1/stories?q=&page=&limit=&category=&author=
Response: a Paginated<T> envelope from @hakawi/shared-types — NOT { stories, pagination }
```

| Previous claim | Reality |
|---|---|
| `Response: { stories: Story[]; pagination: {…} }` | ⚠️ The response is the **shared** `Paginated<T>` envelope from `@hakawi/shared-types` — one list contract for the whole API, not a per-module shape |
| `POST /stories` body `{ title, content, category, tags }` | ⚠️ `category` is a **slug string**, not a UUID. The API takes `categoryId` (a UUID) — see `roadmap/milestones/milestones.md` → *M2* |
| `PUT /stories/:id` | ⚠️ The route is `PATCH /stories/:id` |
| `StoryCreatedEvent.category: string` | ⛔ The real event carries only `{ storyId, authorId }` |

### Pagination — ✅ one shared contract
`Paginated<T>` and `NamedPage<Key, T>` are defined once in `@hakawi/shared-types` and used by every
list endpoint. `UnpagedNamedList` was deleted. This is Principle #10 in practice, and the previous
version's per-module ad-hoc `{ stories, pagination }` shape contradicts it.

---

## Contract Testing — ⛔ NOT IMPLEMENTED

**There is no Pact.** `grep -rn "pact" backend/package.json package.json` returns nothing. The
`describe('Stories API')` / `pact.uponReceiving(...)` example in the previous version describes a
tooling choice the project does not have and never did.

What actually exists:
- **23 database-backed integration files** in `backend/test/*.integration-spec.ts` plus
  `src/modules/**/e2e/` and `src/e2e/`, each against a **real cloned database** — not a mocked
  contract
- `backend/test/mocks/{repositories,stories}.mock.ts` — hand-written repository doubles (⛔ not
  `faker` fixtures; `faker` is not a dependency)
- **3 Playwright browser suites** that exercise the flows end to end, including axe-core WCAG
  checks on the frontend

Contract shape is protected by **compile-time drift assertions** instead:
`Exact<A, B>` in `@hakawi/shared-types` makes a backend/frontend type mismatch a build error. That
is a stronger guarantee than a Pact test for a shared-types-first monorepo, but it protects the
**type** layer, not the runtime payload — which is what the `frontend/src/lib/schemas.ts` Zod
schemas (~50 of them) and the `event-schema-registry.ts` are for.

---

## Versioning Strategy

- **URL Versioning:** ✅ `/api/v1` is the only version. `app.setGlobalPrefix('api/v1')` at
  `backend/src/main.ts:65`
- ⛔ **No `/api/v2`**, no deprecation headers, no sunset mechanism, no migration guides. The
  "6 months notice / 12 months sunset" policy in the previous version is a statement of intent
- ✅ **Backward compatibility within v1** is protected by the `Exact<A,B>` drift assertions and by
  **Zod validation on every frontend response** — a backend change that alters a response shape
  fails the frontend build or the runtime parse, not a production user

---

## Error Handling

### Real error shape
```json
{
  "error": "Bad Request",
  "message": ["email must be an email"],
  "details": [],
  "statusCode": 400,
  "timestamp": "2026-09-30T07:00:00.000Z",
  "path": "/api/v1/auth/register",
  "correlationId": "abc123xyz"
}
```

| Previous claim | Reality |
|---|---|
| `errors: [{ field, message }]` | ⛔ The field is **`details`**, and it is **always `[]`** — nothing populates it. `ValidationPipe` failures put the messages in `message` as a **string array**, so `message` is `string[]` on a 400 and `string` everywhere else |
| `error: "VALIDATION_ERROR"` | ⛔ **No machine-readable error codes exist.** The `error` field carries Nest's reason phrase; the only literal is `INTERNAL_ERROR` |
| 7 error codes listed | ⛔ **None of them are implemented.** See `api-contract/error-handling.md` for the full retained-requirement table |
| `timestamp` present | ✅ Real, ISO 8601 |
| `path` present | ✅ Real |
| `correlationId` | ⚠️ Present **only** when the client sends an `x-correlation-id` header. It is `undefined` otherwise and `JSON.stringify` **drops the key**, so the field is optional in practice |

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality |
|---|---|
| 8 `I*Service` interfaces with 60+ methods | ⛔ **None exist.** There are 18 `I*Repository` interfaces and no service-level interface at all |
| `IUsersRepository.delete` | **`softDelete`** |
| `IUsersRepository.findMany` / `count` | ⛔ Not on the interface |
| `IUsersRepository.verifyEmail` / `requestPasswordReset` / `resetPassword` / `changePassword` | ⛔ Not repository methods; they are service operations writing encrypted columns |
| `IStoriesRepository.findByAuthorId` / `findByCategory` / `search` / `publish` / `unpublish` | ⛔ None are methods. `search` is `ISearchRepository` in a different module |
| `INotificationsRepository` 7 methods | 10 real methods, and it spans two tables (`notifications` + `notification_preferences`) |
| Event classes with `timestamp: Date` and a `type` discriminator | ⛔ **No event carries a timestamp** and none has a discriminator. The real classes are minimal positional records |
| `new StoryPublishedEvent({ storyId, authorId, timestamp })` object-literal construction | ⛔ That call style matches no call site. Real: `emit('story.published', { storyId, publishedAt } as StoryPublishedEvent)` — a dotted string plus a structural cast |
| An `EventBus` class with `emit`/`on` | ⛔ No `EventBus` class and no `EventBusModule`. `CommonModule` calls `EventEmitterModule.forRoot(...)`; consumers inject `EventEmitter2` and declare handlers with `@OnEvent('dotted.name')` |
| `UserDeletedEvent`, `NotificationReadEvent` | ⛔ Neither event exists |
| `NotificationsService` injecting `IUsersService` + `IStoriesService` | ⛔ Not how it works. Event handlers in `modules/notifications/events/` receive the payload directly |
| `POST /users/:id/verify` | ⛔ Does not exist. Real: `POST /users/me/verification` + `POST /users/verification/confirm` |
| `PUT /users/:id`, `PUT /stories/:id` | ⚠️ Both are `PATCH` |
| No `POST /users` / `DELETE /users/:id` | ✅ **Both now exist** (super-admin only) |
| `{ stories: Story[]; pagination: {...} }` | ⚠️ The shared `Paginated<T>` envelope from `@hakawi/shared-types` |
| `POST /stories` with `category: string` | ⚠️ The API takes `categoryId` (a UUID) |
| **Pact contract testing** | ⛔ **Pact is not a dependency.** The example describes a tool the project does not have. Real protection: 23 DB-backed e2e/integration files, 3 Playwright suites, `Exact<A,B>` compile-time drift assertions, ~50 frontend Zod response schemas, and the event schema registry |
| "Versioned APIs" as a design rule | ⛔ **No interface carries a version.** `IStoriesRepository` has one implementation |
| "6 months deprecation / 12 months sunset" | ⛔ No deprecation or sunset mechanism exists |
| Error format with `errors[]` and 7 error codes | ⛔ The field is `details` and is always `[]`; **no error codes are implemented** |
| `correlationId` as a required field | ⚠️ Optional; omitted when the client sends no header |
| — | **New:** the three batched-lookup methods on `IStoriesRepository` (`findAuthorsByIds`, `findCategoriesByIds`, `findTagsByStoryIds`) that exist to prevent N+1 on list endpoints |
| — | **New:** the deliberate `BooksService → PaymentsService` direct call, and why it is justified |

---

*This document defines module contracts for the Hakawi platform.*
