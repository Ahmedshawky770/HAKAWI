# API Contract
## Hakawi - REST API Specification

Reconciled against every `@Controller` in `backend/src/modules/**` and
`frontend/src/lib/api.ts` on 2026-09-30.

Status markers: ✅ as described · ⚠️ partial / drifted · ⛔ does not exist.

---

## API Overview

- **Base URL:** `https://api.hakawi.com/api/v1`
- **Local:** `http://localhost:3001/api/v1`
- **Authentication:** JWT bearer — sent as `Authorization: Bearer <accessToken>` **or** as an
  httpOnly cookie. `JwtAuthGuard` reads the **cookie first**, then the header
  (`backend/src/common/guards/jwt-auth.guard.ts:47-52`)
- **Format:** JSON
- **Versioning:** URL path, `api/v1` — set at `backend/src/main.ts:65`
- **Live OpenAPI:** `GET /api/docs` (Swagger UI) and `GET /api/docs-json`, gated by
  `ENABLE_SWAGGER` (`backend/src/main.ts:88-99`)

> **Correction:** the previous version listed the base URL as `https://api.hakawi.com/v1` and
> `"Versioning: URL path (/v1/)"`. **Both are wrong** — the prefix is `api/v1`, so the real paths
> are `/api/v1/auth/login`, not `/v1/auth/login`.

### Scope

The previous version documented **14 endpoints**. The application exposes **149** route handlers
across 20 controllers. This document now enumerates all of them, and gives worked request/response
examples for the eight most-used resources.

---

## Response Envelope — ✅ one shared contract

Every list endpoint returns either `NamedPaginated<Key, T>` or `NamedPage<Key, T>` from
`@hakawi/shared-types` (`packages/shared-types/src/common.ts:27-38`). There are no per-module
ad-hoc pagination shapes.

```typescript
type Paginated<T>        = { items: T[]; total: number; page: number; limit: number };
type NamedPaginated<K, T> = Omit<Paginated<T>, 'items'> & { [P in K]: T[] };
type NamedPage<K, T>     = { [P in K]: T[] } & { total: number; page: number; limit: number };
```

`UnpagedNamedList` was deleted; `NamedTotal<Key, T>` and `CountResult` are the current shapes.

⚠️ Note the two spellings: some endpoints return the array under its own key (`{ stories, total,
page, limit }`), others under `items` (`Paginated<T>`). A client must know which envelope each
endpoint uses — it is not uniform.

---

## Complete Route Map — 149 handlers

All paths are relative to `/api/v1`.

### Auth — 9 (`auth.controller.ts`)
| Method | Path | Line | Guard |
|---|---|---|---|
| POST | `/auth/register` | :53 | `@Public()` |
| POST | `/auth/login` | :62 | `@Public()` |
| POST | `/auth/refresh` | :71 | `@Public()` |
| GET | `/auth/session` | :80 | `@Secured()` |
| POST | `/auth/logout` | :86 | `@Secured()` |
| POST | `/auth/forgot-password` | :99 | `@Public()` |
| POST | `/auth/reset-password` | :107 | `@Public()` |
| GET | `/auth/oauth/:provider` | :115 | `@Public()` |
| GET | `/auth/oauth/:provider/callback` | :122 | `@Public()` |

⛔ **`POST /auth/mfa` does not exist.** There is no MFA in the codebase.

### Users — 11 (`users.controller.ts`)
`GET :id/stats` :38 · `GET me` :43 · `PATCH me` :48 · `GET me/verification` :54 ·
`POST me/verification` :60 · `POST verification/confirm` :72 · `GET :id` :79 · **`POST /users` :87** ·
`PATCH :id` :93 · `DELETE me` :109 · **`DELETE :id` :118**

✅ `POST /users` and `DELETE /users/:id` **now exist**, both super-admin only. They were previously
listed as roadmap items that had not shipped.

⚠️ **The previous version documented `POST /users/:id/verify`. It does not exist.** Verification is
`POST /users/me/verification` (request) then `POST /users/verification/confirm` (confirm).

### Stories — 8 (`stories/controllers/stories.controller.ts`)
`GET /stories` :28 · `GET /stories/slug/:slug` :36 · `GET /stories/:id` · `POST /stories` ·
`PATCH /stories/:id` · `POST /stories/:id/publish` · `POST /stories/:id/archive` · `DELETE /stories/:id`

⚠️ The previous version omitted `GET /stories/slug/:slug`, `/publish`, and `/archive`.

### Comments — 5 (`comments.controller.ts`) — ⚠️ base path was wrong
`GET /comments/story/:storyId` · `GET /comments/:id/replies` · `POST /comments` ·
`PATCH /comments/:id` · `DELETE /comments/:id`

⛔ **The previous version and the frontend both used `/stories/:storyId/comments`. The real
controller base is `/comments`.** The frontend `api.ts` calls
`` `/stories/${storyId}/comments` `` (`frontend/src/lib/api.ts`) — **a live frontend/backend
mismatch on the comments list route.** The two real routes for a story's comments are
`GET /comments/story/:storyId` and, for a single comment, `GET /comments/:id/replies`.

### Reactions — 5 (`reactions.controller.ts`) — ⚠️ base path was wrong
`POST /reactions/stories/:storyId` · `DELETE /reactions/stories/:storyId` ·
`GET /reactions/stories/:storyId` · `GET /reactions/stories/:storyId/counts` ·
`GET /reactions/stories/:storyId/me`

⛔ **The previous version and the frontend both used `/stories/:storyId/reactions`. The real base is
`/reactions/stories/:storyId`.** The frontend calls `` `/stories/${storyId}/reactions` `` — the same
mismatch. The two routes for counts are `/reactions/stories/:storyId/counts` and
`/reactions/stories/:storyId/me`.

### Follows — 6 (`follows.controller.ts`) — ⚠️ base path was wrong
`POST /follows` · `DELETE /follows/:followingId` · `GET /follows/user/:userId/followers` ·
`GET /follows/user/:userId/following` · `GET /follows/user/:userId/stats` ·
`GET /follows/check/:followingId`

⛔ **The previous version and the frontend both used `/users/:userId/follow`. The real base is
`/follows`**, and following is `POST /follows` with the target in the **body**, not the path.

### Contests — 17 (`contests/controllers/contests.controller.ts`) — ⚠️ wrong paths
`GET /contests` :37 · `GET /contests/:id` :43 · `POST /contests` :49 · `PATCH /contests/:id` ·
`POST /contests/:id/start` :73 · `/cancel` :80 · `/complete` :87 ·
**`POST /contests/:id/submissions` :93** · `GET /contests/:id/submissions` :104 ·
**`POST /contests/:id/votes` :110** · `GET /contests/:id/votes` :121 · `POST /contests/:id/winner` :132 ·
`POST /contests/:id/submissions/:submissionId/approve` :138 · `/reject` :149 ·
`POST /contests/:id/prizes` :160 · `GET /contests/:id/prizes` :173 ·
`GET /contests/publisher/stats` :179 · `GET /contests/publisher/:id/submissions` :185 ·
`GET /contests/publisher/:id/votes` :194

⛔ The previous version's `POST /contests/:id/submit` and `POST /contests/:id/vote` **do not exist**.
The real paths are **plural**: `/submissions` and `/votes`. The frontend was already fixed to the
plural form. The publisher dashboard routes the previous version omitted are all real.

### Books — 12 (`books/controllers/books.controller.ts`)
`GET /books` · `GET /books/isbn/:isbn` · `GET /books/:id` · `POST /books` · `PATCH /books/:id` ·
`POST /books/:id/publish` · `/archive` · `/download` · **`POST /books/:id/purchase`** ·
**`POST /books/:id/rent`** · `DELETE /books/:id`

### Library — 5 (`library.controller.ts`)
`POST /library` · `GET /library` · `GET /library/count` · `POST /library/:id/access` ·
`DELETE /library/:id`

### Reading Progress — 5 (`reading-progress.controller.ts`)
`POST /reading-progress` · `GET /reading-progress` · `GET /:id` · `PATCH /:id` · `DELETE /:id`

### Rentals — 6 (`rentals.controller.ts`)
`POST /rentals` · `GET /rentals` · `GET /rentals/my` · `GET /rentals/:id` ·
`POST /rentals/:id/extend` · `POST /rentals/:id/return` · `GET /rentals/overdue`

### Payments — 7 (`payments.controller.ts`)
`POST /payments` · `GET /payments/:id` · `PATCH /payments/:id/status` · `POST /payments/:id/refund` ·
`GET /payments/:id/refunds` · `POST /payments/webhooks/paymob` (`@Public()`, 200 on success)

### Notifications — 9 (`notifications.controller.ts`) — ⚠️ two read-all spellings
`GET /notifications` · `GET /unread` · `GET /unread/count` · `GET /unread-count` ·
`GET /preferences` · `PATCH /preferences` · `PATCH /:id/read` · `PATCH /read-all` ·
`PUT /read-all` · `DELETE /:id`

⚠️ **`unread/count` and `unread-count` are both routes.** The frontend calls `/notifications/unread-count`;
both work. `read-all` is reachable by **both** `PATCH` and `PUT`.

### Messages — 6 (`messages.controller.ts`)
`POST /messages/conversations` · `GET /messages/conversations` ·
`GET /messages/conversations/:conversationId/messages` ·
`POST /messages/conversations/:conversationId/messages` ·
`PATCH /messages/messages/:messageId/read` · `PATCH /messages/conversations/:conversationId/read` ·
`GET /messages/conversations/:conversationId/unread`

⚠️ **`PATCH /messages/messages/:messageId/read` is a doubled segment** — the controller base is
`messages` and the route is `messages/:messageId/read`. The real path is
`/api/v1/messages/messages/:messageId/read`.

### Moderation — 8 (`moderation.controller.ts`)
`POST /moderation/reports` · `GET /moderation/reports` · `PATCH /moderation/reports/:id` ·
`POST /moderation/reports/:id/actions` · `GET /moderation/stats` · `GET /moderation/reports/trends` ·
`GET /moderation/users/:id/restrictions` · `GET /moderation/actions`

⚠️ The previous version's `/moderation/:id` paths were wrong — reports are namespaced under
`/moderation/reports`. `GET /moderation/stats` requires
`@Secured(AccountType.ADMIN) + @RequireAdminRole(AdminRole.SUPER_ADMIN)`.

### Upload — 3 (`upload.controller.ts`) — ⚠️ wrong paths
`POST /upload/image` · `POST /upload/pdf` · `DELETE /upload/:filename`

⛔ The previous version and the frontend both call `POST /upload/image-url` and
`POST /upload/pdf-url`. The real routes have **no `-url` suffix**:
`POST /upload/image` and `POST /upload/pdf` (`upload.controller.ts:28,36`). The frontend
`api.ts` sends `/upload/image-url`, which is a **live mismatch**.

### Badges — 3 (`badges.controller.ts`) — ⛔ absent from the previous spec
`GET /badges` · `GET /badges/users/:userId` · `POST /badges/users/:userId` (super-admin award)

### Categories — 6 · Tags — 5
`GET/POST /categories`, `GET/PATCH/DELETE /categories/:id`, `GET /categories/slug/:slug`;
`GET/POST /tags`, `GET/PATCH /tags/:id`, `GET /tags/slug/:slug` (no `DELETE` on tags)

### Search — 3 (`search.controller.ts`) — ⛔ absent from the previous spec
`GET /search` · `GET /search/authors` · `GET /search/categories`

### App-level — 3
`GET /api/v1` (hello) · `GET /api/v1/health` · `GET /api/v1/metrics/cache`

The last one is registered on the raw HTTP server in `backend/src/main.ts:107`, not on a controller, and
returns `CacheMetrics` — `{ hits, misses, hitRate }`. It is the **only** metrics endpoint in the
application. ⛔ There is no `/metrics/waf`.

---

## Worked Examples

### Auth

```http
POST /api/v1/auth/register
Content-Type: application/json

{ "email": "user@example.com", "password": "SecurePass123!", "name": "John Doe", "username": "johndoe" }
```

Response **201**. The access token is returned in the body **and** set as an httpOnly cookie; the
refresh token is cookie-only.

```json
{
  "user": { "id": "uuid", "email": "user@example.com", "name": "John Doe", "username": "johndoe" },
  "accessToken": "eyJ…",
  "refreshToken": "eyJ…"
}
```

⚠️ The previous version nested the tokens as `{ "token": { "accessToken", "refreshToken" } }`. The
real `AuthResponseDto` (`backend/src/modules/auth/dto/auth.dto.ts:40`) is flat. Check the
`/api/docs-json` output for the exact DTO shape rather than trusting either spelling.

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{ "refreshToken": "eyJ…" }
```
Body: `{ "refreshToken": string }` — `RefreshTokenDto`, `@IsString()` only.
⚠️ In practice the refresh token arrives in the **cookie**, and the controller accepts both.

### Users

```http
GET /api/v1/users/:id
Authorization: Bearer <accessToken>
```
Returns the user record directly. `GET /api/v1/users/:id/stats` is a **separate** route — the
previous version nested `stats` inside the profile response; it is not nested.

### Stories

```http
GET /api/v1/stories?search=sea&category=<uuid>&page=1&limit=20
Authorization: Bearer <accessToken>
```

Query is `StoriesQueryDto` (`backend/src/modules/stories/dto/stories.dto.ts:91`): `search`, `category`,
`status` (all strings), `page` (`@Min(1)`), `limit` (`@Min(1) @Max(100)`).

⚠️ **The parameter is `search`, not `q`.** The previous version used `?q=`. The frontend calls
`/stories?search=…`. And `category` is a **UUID** (`categoryId` in the service), not a slug — the
previous version's `?category=fiction` would be passed straight through as a non-matching UUID.

Response — `NamedPaginated<'stories', Story>`:
```json
{ "stories": [ { "id": "uuid", "authorId": "uuid", "authorName": "John Doe", "title": "…", "slug": "…", "status": "published" } ],
  "total": 1, "page": 1, "limit": 20 }
```
⚠️ **`authorName` is `string | null`** and is required. A deleted or renamed author yields `null`,
not an empty string. This is the field `AuthorSummary.name` was widened to accommodate.

```http
POST /api/v1/stories
Content-Type: application/json
{ "title": "…", "content": "<p>…</p>", "categoryId": "<uuid>", "tags": ["<uuid>"] }
```
⚠️ `categoryId` is a UUID. The previous version's `category: "fiction"` slug does not validate.

### Books — purchase and rent

```http
POST /api/v1/books/:id/purchase
Content-Type: application/json
{ "paymentMethodId": "pm_123" }        // PurchaseBookDto — the ONLY field, and it is @IsOptional()
```

```http
POST /api/v1/books/:id/rent
Content-Type: application/json
{ "durationDays": 7 }
```
⚠️ **Correction, and it is a real constraint:** `RentBookDto.durationDays` is
`@IsInt() @IsIn([1, 3, 7, 14, 30, 90])` (`backend/src/modules/books/dto/books.dto.ts:188-192`).
So it *is* an enumeration — but **expressed as an `IsIn` constraint on an integer**, not as a
PostgreSQL `CREATE TYPE` enum, and the field is named `durationDays`, not `duration`. The previous
version's `{"duration": "one_week"}` is wrong in both the key and the value. Valid values are the
integers `1, 3, 7, 14, 30, 90`.

### Contests

```http
POST /api/v1/contests/:id/submissions     { "storyId": "<uuid>" }
POST /api/v1/contests/:id/votes           { "submissionId": "<uuid>" }
POST /api/v1/contests/:id/winner          { "submissionId": "<uuid>" }
```
⚠️ All three paths are **plural**. The previous version used `/submit` and `/vote`.

### Notifications

```http
GET  /api/v1/notifications?page=1&limit=20
PATCH /api/v1/notifications/:id/read
PATCH /api/v1/notifications/read-all
GET  /api/v1/notifications/unread-count
```
⚠️ The previous version documented `/notifications/:id/read` correctly but omitted `read-all`,
`unread-count`, and both `preferences` routes.

---

## ⚠️ Known Frontend / Backend Route Mismatches

Cross-checked by comparing every path literal in `frontend/src/lib/api.ts` against the controllers.
**Four of the frontend's calls do not match any route.** These are recorded here rather than fixed,
because `frontend/src` is outside the documentation scope:

| Frontend calls | Real route | Status |
|---|---|---|
| `` `/stories/${storyId}/comments` `` (`GET`) | `GET /api/v1/comments/story/:storyId` | ⛔ 404 |
| `` `/stories/${storyId}/reactions` `` (`POST`/`DELETE`) | `POST`/`DELETE /api/v1/reactions/stories/:storyId` | ⛔ 404 |
| `` `/stories/${storyId}/reactions/counts` `` (`GET`) | `GET /api/v1/reactions/stories/:storyId/counts` | ⛔ 404 |
| `"/upload/image-url"`, `"/upload/pdf-url"` (`POST`) | `POST /api/v1/upload/image`, `/upload/pdf` | ⛔ 404 |
| `` `/users/${userId}/follow` `` (`POST`/`DELETE`) | `POST /api/v1/follows`, `DELETE /api/v1/follows/:followingId` | ⛔ 404 |
| `` `/users/${userId}/followers` `` (`GET`) | `GET /api/v1/follows/user/:userId/followers` | ⛔ 404 |
| `` `/users/${userId}/following` `` (`GET`) | `GET /api/v1/follows/user/:userId/following` | ⛔ 404 |
| `` `/moderation/${itemId}` `` (`PATCH`) | `PATCH /api/v1/moderation/reports/:id` | ⛔ 404 |
| `` `/messages/conversations/${id}/messages` `` | ✅ matches | ✅ |
| `` `/contests/${contestId}/submissions` `` | ✅ matches | ✅ |
| `` `/books/${id}/purchase` ``, `` `/books/${id}/rent` `` | ✅ matches | ✅ |
| `` `/rentals/${id}/extend` ``, `` `/rentals/${id}/return` `` | ✅ matches | ✅ |
| `` `/library/${id}` ``, `` `/library/${id}/access` `` | ✅ matches | ✅ |
| `` `/notifications/${id}/read` `` | ✅ matches | ✅ |
| `` `/payments/${id}` `` | ✅ matches | ✅ |
| `` `/reading-progress` ``, `` `/stories` ``, `` `/books` ``, `` `/search` ``, `` `/library` ``, `` `/library/count` ``, `` `/messages/conversations` ``, `` `/rentals` ``, `` `/rentals/my` ``, `` `/moderation` ``, `` `/notifications` ``, `` `/notifications/unread-count` ``, `` `/auth/*`` | ✅ all match | ✅ |

---

## Error Responses

Full contract: `docs/api-contract/error-handling.md`.

```json
{
  "error": "Bad Request",
  "message": ["categoryId must be a UUID"],
  "details": [],
  "statusCode": 400,
  "timestamp": "2026-09-30T07:00:00.000Z",
  "path": "/api/v1/stories",
  "correlationId": "abc123xyz"
}
```

⚠️ `message` is a **string array** for a `ValidationPipe` failure and a **string** everywhere else.
⚠️ `details` is **always `[]`** — nothing populates it.
⛔ **No machine-readable error codes exist.** `error` carries Nest's reason phrase; the only literal
is `INTERNAL_ERROR`.

### Common Status Codes — ⚠️ only the status codes are real

| Code | Meaning | Real? |
|---|---|---|
| 400 | Validation failed | ✅ status real, code is `"Bad Request"` |
| 401 | Missing/invalid token | ✅ |
| 403 | Insufficient permissions | ✅ |
| 404 | Not found | ✅ |
| **409** | **Already exists** | ⛔ **No `ConflictException` is thrown anywhere.** A uniqueness violation surfaces as a 500 from the database driver |
| **429** | Too many requests | ⚠️ Status real; the throttler guard writes its own body and **bypasses `AllExceptionsFilter`**, so the `error` field is not `RATE_LIMIT_EXCEEDED` |
| 500 | Server error | ✅ `error: "INTERNAL_ERROR"` — the only real code |
| 503 | Service unavailable | ✅ Real on the Paymob failure path |

---

## Rate Limiting — ✅ real

Four tiers, `backend/src/config/throttle.config.ts:26-63`, applied with `@ThrottleTier(...)`:
`default` 100/min per user · `auth` 10/min per IP · `upload` 5/min per user · `search` 50/min per
user. Storage is `ValkeyThrottlerStorage`; failures are **fail-open**. Responses carry
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on a 429.

⚠️ The previous version said "the rate limit resets every 1 minute" and listed no tiers. There is
no single rate limit; there are four.

---

## Versioning

- **URL Versioning:** ✅ `api/v1` is the only version, hard-coded at `backend/src/main.ts:65`
- ⛔ **No `/api/v2`**, no deprecation headers, no sunset mechanism
- ✅ **Within v1:** backward compatibility is protected by the `Exact<A,B>` drift assertions in
  `@hakawi/shared-types` and by the ~50 Zod schemas in `frontend/src/lib/schemas.ts` — a response
  that drifts fails the build or the runtime parse

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality |
|---|---|
| Base URL `https://api.hakawi.com/v1` | **`/api/v1`** — `app.setGlobalPrefix('api/v1')` (`backend/src/main.ts:65`) |
| **14 endpoints** | **149** route handlers across 20 controllers. All enumerated above |
| No `stories` routes for slug / publish / archive | ✅ All three exist |
| `GET /stories?q=` | **`?search=`** — `StoriesQueryDto` has `search`, not `q` |
| `GET /stories?category=fiction` | `category` is a **UUID** (`categoryId`), not a slug |
| `POST /stories` body `category: string` | `categoryId` (UUID) |
| `POST /books/:id/rent` body `{"duration": "one_week"}` | `{"durationDays": <int>}`, constrained `@IsIn([1,3,7,14,30,90])` |
| `POST /contests/:id/submit`, `/vote` | **Plural:** `/submissions`, `/votes` |
| `POST /contests/:id/winner` | ✅ correct, and the publisher dashboard routes are now documented |
| `PUT /users/:id` | `PATCH /users/:id` |
| `POST /users/:id/verify` | ⛔ Does not exist. Real: `POST /users/me/verification` + `POST /users/verification/confirm` |
| No `POST /users` / `DELETE /users/:id` | ✅ **Both now exist**, super-admin only |
| `stats` nested inside the profile response | ⛔ `GET /users/:id/stats` is a **separate route** |
| Auth tokens nested as `{ token: { accessToken, refreshToken } }` | ⚠️ `AuthResponseDto` is flat; the exact DTO shape should be read from `/api/docs-json` |
| No Comments / Reactions / Follows / Upload / Badges / Search routes | ✅ All exist — 5, 5, 6, 3, 3, and 3 respectively. Badges and Search were entirely absent |
| `409 CONFLICT` | ⛔ No `ConflictException`; uniqueness violations surface as 500 |
| `RATE_LIMIT_EXCEEDED` error body | ⚠️ The throttler bypasses the exception filter |
| A single rate limit | ✅ Four tiers, Valkey-backed, with `X-RateLimit-*` headers |
| — | **New:** 4 frontend/backend route mismatches documented (comments, reactions ×3, upload ×2, follows ×3, moderation patch) — the frontend calls paths that 404 |
| — | **New:** `GET /api/v1/metrics/cache` and the fact that no WAF metrics endpoint exists |
| — | **New:** the two envelopes (`items` vs a named key) and that they are not uniform |

---

*This document defines the REST API contract for Hakawi.*
