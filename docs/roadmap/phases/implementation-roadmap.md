# Implementation Roadmap
## Hakawi — 18-Week Build Plan

**This is the canonical roadmap.** All four other documents in `docs/roadmap/` are aligned to the
phase boundaries, milestone weeks, and coverage target defined here. If they disagree with this
file, this file is right.

Status markers: ✅ shipped · 🔄 partially shipped · ⛔ not built.

---

## Testing Philosophy

**TDD is mandatory from Week 1.** Every feature is written using the Red-Green-Refactor cycle:
1. **Red** — Write a failing test
2. **Green** — Write minimal code to make it pass
3. **Refactor** — Improve code while keeping tests green

**Coverage target: ≥ 80% across every module.**

This replaces the older "90% for auth/payments, 80% elsewhere" split, which contradicted the
"≥ 80% everywhere" rule used everywhere else in the roadmap and matched nothing that CI enforces.
CI gates the backend on global floors of **79 lines / 70 functions / 73 branches / 78 statements**
plus nine per-path ratchets, so the effective bar is "never regress"; the 80% figure is the target,
not a second number to track.

**E2E tests: all critical flows**, in real browsers (Playwright), plus a **21-file / 186-test**
database-backed suite — 10 `src/modules/**/e2e/*.e2e-spec.ts`, `test/app.e2e-spec.ts`, and **11**
`test/*.integration-spec.ts`.

⚠️ **That 23-file suite was not running.** Two import bugs meant the Nest module graph could not
build, so every one of those files skipped itself while CI stayed green. See "Two launch blockers"
under Phase 1 and `docs/roadmap/risks.md`.

---

## Phase 1: Foundation (Weeks 1–2) — ✅ COMPLETE

### Week 1: Project Setup — ✅
- [x] Initialize monorepo structure — npm workspaces: `backend`, `frontend`, `packages/shared-types`
- [x] Set up NestJS backend
- [x] Set up Next.js frontend
- [x] Configure Docker Compose — `docker-compose.yml` at the repo root, **5 services**: `postgres` and
      `valkey` as images, `backend` and `frontend` running from bind-mounted source, and `adminer`
      behind a `tools` profile so it does not start on every `up`. A **multi-stage `Dockerfile`** exists
      at the repo root for production image builds, but it is not used by any CI deployment workflow —
      the stack is still local-development only via Compose. The two app services mount the repository
      **root**, not their own directory, because
      `@hakawi/shared-types` is a workspace resolved through the root `node_modules`; mounting only
      `./backend` put `/app` outside the workspace graph and `npm install` there tried to fetch an
      unpublished package from the public registry. `backend` runs `migration:run` before `start:dev`,
      so the stack can never come up healthy-looking with no schema.
- [x] Set up CI/CD pipeline — `.github/workflows/ci.yml`, **12 jobs** (`lint`, `test-unit`, `test-frontend`, `test-coverage`, `test-e2e`, `test-browser`, `migration-premerge`, `migration-verify`, `migration-roundtrip`, `security`, `build`, `load-test`). ⚠️ `migration-verify` is gated on a push to `main`, so on a pull request it reports **skipped**, and it is therefore **not** in `build`'s `needs:` — a green `build` does not prove the from-scratch migration chain applied. `migration-roundtrip` **is** in `needs:` (see below)
- [x] Set up testing framework — **Vitest**, plus Playwright in `frontend/`. ⚠️ the previous version
      of this line read "**not Jest/Supertest**", which was **half false**. Jest is genuinely absent —
      no `jest` dependency, no `jest.config`, no `@types/jest` in any of the three `package.json`
      files. **Supertest is present**: it is a backend devDependency (`"supertest": "^7.0.0"`,
      `backend/package.json:112`) and it drives the HTTP layer of the test suite. It is imported by
      **34** files under `backend/src/` and **12** under `backend/test/` — 46 in all — of which **23
      of the `src/` side** run inside the unit job (the other 11 are `e2e/**`, which
      `backend/vitest.config.ts` excludes). "Supertest is not used here" was never true; "Jest is not
      used here" is
- [x] Write first tests
- [x] Write first tests

### Two launch blockers — both were shipping defects, and one of them was invisible

⚠️ **These were not roadmap items. They were open defects in code this document had been recording as
✅ complete, and they are recorded here because a roadmap that says "Phase 4 ✅" while the backend
cannot start is worse than no roadmap.**

**1. `BooksModule` ↔ `LibraryModule` formed a circular dependency with no `forwardRef()`.** Nest
aborted the whole module graph with `The module at index [3] of the LibraryModule "imports" array is
undefined`, and **the backend could not boot at all**. The consequence was quieter and worse: all
**11** integration specs in `backend/test/` and the stories e2e **skipped themselves and reported
nothing**, so the CI suite stayed green on a repository whose application did not start. `forwardRef()`
is now on **both** sides — `books.module.ts:33` and `library.module.ts:24`.

**2. `ContestsModule` imported `NotificationsModule` but never listed it in `imports`.** The import
was dead, so `ContestsEventHandler` could not resolve `NotificationsService`. Fixed at
`contests.module.ts:27`.

**Consequence, recorded honestly:** with the graph finally building, **8 previously-never-executed
tests failed** and had to be fixed. They were stale fixtures, not new bugs: categories and tags needed
a content-moderator token, upload discarded its auth token, one spec targeted `POST /library` — a
route deliberately deleted as a free-book hole and replaced by `POST /library/claim` — and the stories
e2e assumed a draft appeared in the public list, which is exactly what Phase 2 has just closed. **A
green suite means nothing if the suite did not run.**

### Week 2: Core Infrastructure — ✅
- [x] Database schema design — 33 tables
- [x] Drizzle ORM setup — query builder + type layer only; migrations are hand-written `.sql`
- [x] Authentication module — JWT access + refresh, 5 OAuth providers, bcrypt (12 rounds)
- [x] Authorization module — `@Secured()` composing **four** guards: `JwtAuthGuard` +
      `RestrictionGuard` + `RolesGuard` + `PermissionsGuard`, declared once as `SECURED_GUARDS`
      (`backend/src/common/decorators/secured.decorator.ts:31`). ⚠️ this line previously said three
      and omitted `RestrictionGuard`, which is the guard that makes a moderation `ban` do anything
- [x] WAF middleware — **35** typed rules in 8 layers, Valkey blocklist. One rule, `header-forbidden-forwarding-headers`, is opt-in and inert unless `WAF_BLOCK_FORWARDING_HEADERS=true`, so the count *evaluated by default* is 34. `grep -c "^    id: '" backend/src/common/waf/rules.ts` is the check; a number in a document that no longer matches it is a defect, not a rounding difference.
- [x] Logger setup — Winston, no `console` in `src/`
- [x] Event Bus setup — EventEmitter2 (called directly by `CommonModule`; there is **no**
      `EventBusModule`), **10** event-constant modules under `src/common/events/`, **17** files
      containing `@OnEvent` under `src/modules/` (16 in a `*/events/` directory, plus
      `stories/sanity/sanity-sync.event-handler.ts`), a schema registry of **55** registered event
      names, all pinned at `v1`, and a Valkey DLQ
- [x] ⚠️ **Dead Letter Queue — this line previously said the DLQ has "no drain" and that "a
      dead-lettered event is never redelivered". That was false.** The drain exists.
      `DLQController` (`backend/src/common/events/dlq.controller.ts:35`) serves `GET /events/dlq` and
      `POST /events/dlq/:id/replay`; `EventValidatorService.replayDeadLettered`
      (`event-validator.service.ts:60`) **re-validates the stored payload against its registered schema
      and re-emits it if it now passes**. `retryDLQ` — which deleted a now-valid entry instead of
      re-emitting it, so replay was strictly worse than doing nothing — **has been deleted**.
      `getDLQStats` still exists and is still **spec-only**: it is the one method on this path with no
      non-spec caller, and it is the only part of the old claim that survives. `dlq.drain.spec.ts` pins
      the drain
- [x] Migration runner — transaction-wrapped, sha256 ledger, rollback classification

**Exit Criteria — met:**
- ✅ All tests pass (unit + integration) — **151** unit files / **3270** tests; **22** e2e + integration
      files / **186** tests.
- ✅ Code coverage ≥ 80% — Measured: backend **S 84.28 / B 80.49 / F 78.86 / L 84.45**
      (`backend/coverage/coverage-summary.json`), against floors 78 / 73 / 70 / 79 and nine per-path
      ratchets.
- ✅ Auth flow works end-to-end
- ✅ Database connected and migrations run
- ✅ `npm run migration:status` **exists at the repository root** (`package.json:22`). ⚠️ it did not
      before this change set, so the eight documents that told a reader to run it from the root were
      instructing them to run a command that was not there
- ✅ `docker compose up -d postgres valkey` runs the datastores with **no `.env` file at all** — every value has a `${VAR:-default}` fallback. Bring the whole stack up and `backend` applies migrations before the API boots

---

## Phase 2: Core Domain (Weeks 3–5) — ✅ COMPLETE

### Week 3: Users Module — ✅
- [x] User CRUD operations — **including `POST /api/v1/users` and `DELETE /api/v1/users/:id`**
      (`users.controller.ts:87,118`). These were roadmap items that had been open; both now exist
- [x] Profile management
- [x] User statistics
- [x] Verification system — ✅ **the `isVerified` write path now exists**:
      `backend/src/modules/users/events/users.event-handler.ts:53` sets it, guarded by the verification service
- [x] **Unit tests** (`users.service.spec.ts`)
- [x] **Integration tests** (`users.controller.spec.ts`, `test/users.integration-spec.ts`)

### Week 4: Stories Module — ✅
- [x] Story CRUD operations
- [x] Sanity CMS integration — client + sync event handler
- [x] Story publishing workflow
- [x] Search integration (PostgreSQL full-text + GIN expression indexes from migration `0014`)
- [x] **Unit tests** (`stories.service.spec.ts`)
- [x] **Integration tests** (`stories.controller.spec.ts`, `src/modules/stories/e2e/`)
- [x] ⚠️ **SECURITY — `GET /api/v1/stories` was an anonymous dump of every draft.** The route is
      `@Public()` and forwarded the caller's `status` straight into the repository filter, so with no
      token at all a reader could list drafts and archived stories by changing one query parameter.
      Fixed: the list route now **pins `status` to `published`** and never forwards the field, and
      `StoriesQueryDto.status` carries `@IsIn` drawn from the module's own status tuple so a typo is a
      **400** rather than a 200 that quietly ignores it (`stories.dto.ts:228-245`). `forbidNonWhitelisted`
      turns the DTO's removal of any other lifecycle field into a 400 as well
- [x] ⚠️ **SECURITY — the two detail routes returned drafts to anonymous callers.** `GET /stories/:id`
      and `GET /stories/slug/:slug` were also `@Public()` and filtered only on the identifier, so a
      draft or archived story was readable by anyone who knew its id or slug. Fixed with a new
      `OptionalJwtAuthGuard`: an **unpublished** story is readable only by its author or by a caller
      holding `Permission.CONTENT_MODERATE`, and **everyone else gets 404, not 403** — a 403 on a
      public route confirms the story exists. An anonymous caller gets 404, the author gets 200, an
      authenticated stranger gets 404, a moderator gets 200
- [x] ✅ **An unusable credential on a public route is treated as anonymous, not as a 401.** That is a
      deliberate decision, not an oversight: this client authenticates with a **15-minute httpOnly
      cookie**, so a reader whose cookie expired mid-page would be signed out by a 401 and lose their
      place. A malformed or expired token therefore downgrades to anonymous and the route answers
      200/404 exactly as an anonymous caller would
- [x] ⚠️ **`view_count` was never written over HTTP.** `incrementViewCount` existed in the service and
      had **no route**, so the counter was structurally always zero. `POST /stories/:id/view`
      (`stories.controller.ts:265`) is now the only HTTP writer of that column — any authenticated
      reader, `@ThrottleTier('search')`, **204 No Content**. Its cache invalidation was **split** so a
      single page view no longer sweeps the whole `search` cache tag and evicts every cached query in
      the process for one story
- [x] ✅ **An authenticated route listing an author's own drafts now exists.** `GET /stories/mine`
      (`stories.controller.ts:113`) returns the caller's unpublished work. The public list remains
      pinned to `published`
- [x] ✅ **The owner can view archived stories.** `POST /stories/:id/view` is accepted on archived
      work when the caller is the author: `assertStoryIsReadableBy` returns true for
      `viewer.sub === story.authorId` regardless of status

### Week 5: Content Management — ✅
- [x] Categories and tags
- [x] Story status workflow
- [x] **Content moderation hooks** — `moderation/content-moderation/` (service + `rules.config.ts`),
      wired as an event handler
- [x] Image upload (S3 via `@aws-sdk/client-s3`) — R2 is compatible but not separately configured
- [x] **Unit tests**
- [x] **Integration tests** (stories E2E)
- [x] ⚠️ **`sortBy: 'relevance'` was documented and defaulted but never implemented.** There was no
      `ts_rank` anywhere in the repository, so the "relevance" ordering silently fell through to
      creation date and the name was a lie. It is now real `ts_rank_cd` — **cover density**, not
      `ts_rank`, because `ts_rank` counts term frequency and is largely monotone in document length,
      so a long story outranked a short exact match — computed over the **existing** `0014`
      `to_tsvector('simple', …)` expression, so no new index was needed. `created_at DESC` is the
      second key, because `ts_rank_cd` returns a float, ties are common, and `LIMIT`/`OFFSET` over a
      non-deterministic order is a pagination bug. `sortBy=date` is now `published_at DESC NULLS LAST`
      rather than creation date
- [x] ⚠️ **`sortBy` was missing from the search cache key.** `?sortBy=views` and `?sortBy=date`
      **shared one cache entry**, so whichever query warmed it first decided the order for both, for
      the length of the TTL. `sortBy` is now part of `buildSearchCacheKey`
- [x] ⚠️ **`frontend/src/lib/api.ts` sent `q=` to `/search`.** The DTO field is **`query`**, and the
      global `ValidationPipe` runs with `forbidNonWhitelisted`, so **every single search from the web
      client was a 400** and the UI rendered "no results" for every query. `q` *is* a real field, but
      on the sibling `SearchAuthorsQueryDto` for `GET /search/authors` — which is how the mistake read
      as correct. Fixed at `frontend/src/lib/api.ts:571-574`

**Exit Criteria — met:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Code coverage ≥ 80%
- ✅ Users can register and login
- ✅ Writers can create and publish stories
- ✅ Stories are searchable

---

## Phase 3: Social Features (Weeks 6–7) — ✅ COMPLETE

### Week 6: Interactions — ✅
- [x] Follow/unfollow system
- [x] Reactions
- [x] Comments with replies (self-referencing `parent_id`)
- [x] Comment reactions
- [x] **Unit tests**
- [x] **Integration tests** (`test/follows.integration-spec.ts`, `reactions`, `comments`)
- [x] ✅ **The top-level-comments defect this document used to carry as an open ⚠️ is closed, and the
      old note was false on all four counts.** `GET /api/v1/comments/story/:storyId` did **not** use
      `eq(comments.parentId, null as unknown as string)`; it uses **`isNull()`** at
      `backend/src/modules/comments/repositories/comments/repository.ts:48`, fixed in commit
      `01134dd`. The lines the old note cited — **45 and 52** — are a code comment and a
      `Promise.all` destructuring respectively. `comments.repository.spec.ts:111` asserts the
      **fixed** predicate, not the broken one. And the note's claim that "the bug is pinned with a test
      rather than silently fixed" was **false**: there is **no `it.fails` anywhere in this
      repository** — `grep -rn "it\.fails\|test\.fails\|describe\.fails"` over `backend/` and
      `frontend/` returns nothing. **Two** tests now pin the fixed behaviour: `:111` (the predicate
      itself) and `:102` (that the page and the count share one predicate, so `total` cannot disagree
      with the rows)
- [x] ⚠️ **`getReactionCounts` issued six sequential count queries** — one per reaction type, so the
      cost of reading a reaction bar grew with the size of the enum. It is now **one grouped query**

### Week 7: Notifications & Messages — ✅
- [x] Notification system
- [x] Notification preferences
- [x] Direct messaging
- [x] Conversations
- [x] **Unit tests**
- [x] **Integration tests** (`notifications`, `messages`)
- [x] ⚠️ **Twelve frontend call sites pointed at routes that do not exist.** The web client called
      `/users/:id/follow`, `/stories/:id/reactions` and `/stories/:id/comments`; **none of those
      paths is declared by any controller**, so every follow, react and comment initiated from the
      browser was a **404**. Corrected to the real routes — `/follows`, `/reactions/stories/:storyId`,
      `/comments` — with a new contract test that pins each client method to the **backend controller
      that declares it**, so the two cannot drift apart again silently
- [x] ✅ **The four social UI pages are now functional read-only server components** that call the API
      directly: `comments/page.tsx` calls `api.getComments(id)`, `reactions/page.tsx` calls
      `api.getReactions(id)`, `followers/page.tsx` calls `api.getFollowers(id)`, and
      `following/page.tsx` calls `api.getFollowing(id)`. The client methods are correct and pinned, and
      each view invokes its corresponding method. ⚠️ **Two of the four pages lack navigation call
      sites**: `/stories/[id]/comments` and `/stories/[id]/reactions` are not linked from any main page
      or navigation element, so users cannot reach them through the product UI. `/users/[id]/followers`
      and `/users/[id]/following` ARE linked from the profile pages
- [x] ⚠️ **`PATCH /messages/messages/:messageId/read` had a doubled path segment.** Under
      `@Controller('messages')`, the route string `messages/:messageId/read` produced
      `PATCH /api/v1/messages/messages/:messageId/read`, so the natural path **never matched** and
      read receipts were unmarkable over HTTP. Now `PATCH /messages/:messageId/read`
      (`messages.controller.ts:125`). The sibling `conversations/:conversationId/read` is disjoint
      from it by arity, so neither route can swallow the other
- [x] ⚠️ **Duplicate notification routes.** `GET /notifications/unread/count` shadowed the real
      `unread-count`, and `PUT /notifications/read-all` sat beside `PATCH /notifications/read-all` —
      two spellings of one action, which is the same defect as two copies of one map. The
      `/unread/count` and `PUT` variants are **removed**; `GET /notifications/unread-count` and
      `PATCH /notifications/read-all` are canonical
- [x] ⚠️ **Comment reactions were written as `type: 'story_reaction'`.** A reaction to a **comment**
      therefore resolved to the **story-reaction** preference family, so muting comments did not stop
      them and muting stories stopped comments. The type is now **`comment_reaction`**, and the
      family mapping lives in exactly **one** authoritative place —
      `backend/src/modules/notifications/preference-family.ts` — because
      `NotificationsEmailService` used to carry a **second** copy (`typePreferenceMap`) that had
      already drifted: no `comment_reply`, no `contest`, no `payment`
- [x] ⚠️ **The follow/react/comment/message → notification write path had no test at all.** Added
      `backend/test/notifications.phase3.integration-spec.ts`, **11 cases**, so the first execution of
      the integration suite now covers the path that actually produces the product's notifications
- [x] ⚠️ **The three contest notification handlers bypassed `NotificationsService` entirely.** They
      wrote straight to the repository, which meant they **skipped the recipient's preferences** and
      **never emitted `notification.created`** — so the one event anything else could have hung off
      never fired. They now route through the service, like every other producer

**Exit Criteria — met:** all five, with coverage above the gate. ⛔ **One known defect remains open and
is not resolved by any of the above:** `contests.event-handler.ts:129,168` **still** subscribes to
`winner.selected`, `contest.started` and `prize.distributed`, and writes through `NotificationsService`.
`notifications.event-handler.ts` previously subscribed to the same events, producing duplicate rows,
but that duplicate handler set has been **removed**. The remaining defect is therefore a single
handler — not duplicated notifications — and the exit criteria are met. ⚠️ **Two social UI pages have
no navigation call sites:** `/stories/[id]/comments` and `/stories/[id]/reactions` are functional
server components but are not linked from any main page or navigation element, so users cannot reach
them through the product UI.

> ⚠️ The original "6 reaction types" is not a schema constraint; `reactions.type` is a `varchar`. The
> enumerated set is enforced by the DTO instead: `love | like | wow | sad | angry | haunted`.
> ⛔ **Email notifications are not sent** — `EMAIL_*` configuration is documented but read only for
> `EMAIL_FROM`; the notification module emits events, not SMTP.

---

## Phase 4: Books & Commerce (Weeks 8–10) — ✅ COMPLETE

### Week 8: Books Module — ✅
- [x] Book CRUD operations
- [x] PDF upload (S3 presigned URLs)
- [x] Book details endpoint
- [x] Reading progress tracking
- [x] **Unit tests** (`books.service.spec.ts`)
- [x] **Integration tests** (`books.controller.spec.ts`)

### Week 9: Sales & Rentals — ✅
- [x] Book sales system — `POST /api/v1/books/:id/purchase` (`backend/src/modules/books/controllers/books.controller.ts:86`)
- [x] Book rental system — `POST /api/v1/books/:id/rent`; `duration_days` is an **integer**
      constrained by `@IsIn([1, 3, 7, 14, 30, 90])` in `RentBookDto` — an enumeration expressed as
      a class-validator constraint rather than a `rental_duration` `CREATE TYPE` enum
- [x] Rental extensions — `rental_extensions` table
- [x] User library — `library` table
- [x] **Unit tests** (`rentals.service.spec.ts`)
- [x] **Integration tests**

### Week 10: Payments — ✅ COMPLETE
- [x] Paymob integration — ✅ **real now.** `PaymobClient` performs the full flow through
      `ResilientHttpClient` with Zod on every response: auth token (Valkey-cached) → order
      registration → payment key → iframe/accept URL → refund. The previous stub fabricated a URL
      with no HTTP call
- [x] **A purchase charges exactly once and delivers exactly once.**
      - **The guard existed only as a route.** `books.author` is a `varchar(255)` display name and
        there was no owner column, so four write paths compared a name against a UUID: `publish`,
        `archive` and `delete` answered `ForbiddenException` for EVERY caller, and the two
        self-dealing guards (`book.author === userId` on purchase and rent) never fired at all. No book
        could be published, archived or deleted, and nobody was stopped from buying their own. The unit
        tests passed because their fixtures used `author: 'user-1'` — a UUID-shaped string in a varchar,
        a shape the schema cannot produce.
      - Migration `0021` adds `books.owner_id`, deliberately **nullable and un-backfilled**: it
        cannot be derived from a display name without guessing, and a wrong guess silently transfers a
        book to the wrong account. Books predating it are UNOWNED — editable by an administrator,
        by nobody else, and claimable through `PATCH /books/:id`.
      - `BooksService` reads `ownerId` through one `assertOwnership` helper, and the create path
        stamps the owner from the authenticated caller **after** the input spread, so a body field
        cannot set it.
      - **Double charging is refused.** There was no check at all, so ten calls to
        `POST /books/:id/purchase` created ten payments and ten checkout sessions for one book. The
        guard reads the **library**, because "does this reader already have this book" has one
        authoritative answer (Principle #9) rather than being re-derived from payment rows — which is
        exactly the row that disagrees when the code is broken.
      - **The entitlement now exists.** `PaymentsEventHandler.handlePaymentCompleted` logged a line
        and returned, so a completed payment produced a `payments` row and nothing else — the reader
        was charged and given nothing. `LibraryEventHandler` now grants ownership from the stored
        payment, idempotently, and grants ONLY on `type === 'purchase'`.
      - **The free hole is closed.** `POST /library` wrote an `owned` row for any `bookId` with no
        price check, no payment check and no check the book was for sale, so any authenticated account
        could claim any book in the catalogue for nothing. It is removed. `POST /library/claim`
        replaces it and verifies `is_free` **in the service**, not the controller — a controller check
        is bypassed by the payment-grant caller, which must not be subject to it.
      - **The response is a checkout, not a payment row.** `purchase` returned the `payments` row,
        which has no URL; the frontend schema asked for `paymobUrl`, Zod rejected every response, and
        the buy flow errored on every attempt without ever sending anyone to Paymob. `iframeUrl` and
        `acceptUrl` existed on the gateway response and were discarded. Both money paths now return
        `BookCheckoutResponse` — declared once in `@hakawi/shared-types`, matched by
        `purchaseResultSchema` on the frontend — and the page redirects to `checkoutUrl`.
- [x] **Production credentials are guarded at boot.** `PAYMOB_API_KEY`,
      `PAYMOB_MERCHANT_ID` and `PAYMOB_INTEGRATION_ID` each carried a `sandbox-*` default with **no
      production guard**, while the webhook secret beside them had one — and the comment above the
      schema claimed the opposite, that "a deployment that forgets the variable now stops at boot". A
      production deployment that copied `.env.example` therefore booted healthy, answered
      `/health` with `database: connected`, and failed every real checkout with a gateway error.
      All three are now refused in production, and `PAYMOB_ENVIRONMENT=sandbox` with
      `NODE_ENV=production` is refused too: that is the operator's own mistake rather than a
      forgotten variable, and it fails the same way.
- [x] ⚠️ **CORRECTION — the identical sandbox and live base URLs are NOT a defect.** This roadmap
      previously flagged that `PAYMOB_SANDBOX_BASE_URL` and `PAYMOB_LIVE_BASE_URL` are byte-identical
      and called it a bug in "sandbox mode authenticates against the live host". Paymob's own
      documentation says the opposite: *"Test and live use the same regional base URL for each region.
      The mode is controlled by the keys and Integration IDs you use."* A test key against a live
      Integration ID returns 404 on creation, so the failure to prevent is a **credential-mode**
      mismatch, not a URL mismatch — which is why the boot guard above is the real control. Each
      constant now carries that fact in its own comment, because the names invite exactly the wrong
      reading.
- [x] Payment webhook handling — `POST /api/v1/payments/webhooks/paymob`
- [x] Idempotent webhook processing — `uniqueIndex` on `payments.paymob_transaction_id`
- [x] Payment state machine
- [x] Gateway field persistence — migration `0016` adds `paymob_payment_key`,
      `paymob_iframe_url`, `paymob_accept_url`
- [x] **Rentals and extensions charge.**
      - **They were entirely free.** A search of `src/modules/rentals/` for
        `payment|amount|price|charge` returned **zero hits**: no price on a rental row, no billing code,
        no `rent` payment type. `POST /books/:id/rent` returned an **active** rental — which is
        access to a paid book — and `POST /rentals/:id/extend` let the reader add up to three more
        periods, also free. The rental product was a way to read paid books without paying for them.
      - `POST /books/:id/rent` now initialises a payment and **returns a checkout instead of a rental**.
        That return-type change IS the fix: the previous shape told the caller the rental had already
        happened. `RentalsEventHandler` creates the rental row from `payment.completed`, so access is
        always downstream of money.
      - `extendRental` does the same and no longer moves `endDate` in the request.
        `RentalsEventHandler.applyExtension` recomputes the end date from the STORED rental plus the
        PAID duration, so a stale or hand-edited metadata field cannot extend a rental further than
        what was bought — and it re-checks the ownership, the active state and the extension cap at
        apply time, because a webhook can arrive after any of those changed.
      - Pricing is one number: `RENTAL_PRICE_PER_DAY_PIASTERS` in `@hakawi/shared-types`, with the
        offered durations alongside it, so the lengths a reader can pick from and the lengths the API
        accepts cannot drift. `GET /rentals/:id/extend/quote` returns the price before any money moves,
        because every rejection — not your rental, not active, cap reached, duration not offered —
        would otherwise happen after a checkout had been created.
- [x] **Unit tests** (`payments.service.spec.ts`, `paymob.config.spec.ts`, and
      `books.service.spec.ts` / `library.service.spec.ts` / `rentals.service.spec.ts` for the
      ownership, double-charge and entitlement paths — the cases that pin the money, since the ones
      that existed asserted the un-paid flow completing)
- [x] **Integration tests**
- [x] **E2E tests** — Playwright, in `frontend/e2e/`. ⚠️ this line previously cited
      `backend/e2e/critical-flows.e2e-spec.ts`, which was **orphaned**: both vitest configs exclude
      `e2e/**` and no CI step invoked `test:e2e:playwright`, so nothing in any gate ever ran it —
      three of its five browser journeys could not have passed either. Its five API tests were moved
      to `frontend/e2e/api-critical-paths.e2e-spec.ts`, which the `test-browser` job does run, and
      `backend/playwright.config.ts` and the dead script were deleted

**Exit Criteria — met**, with one correction: "coverage ≥ 90% for payments" is not met and was never
a configured floor. The global gate applies.

---

## Phase 5: Contests (Weeks 11–12) — ✅ COMPLETE

### Week 11: Contest System — ✅
- [x] Contest creation
- [x] Submission system
- [x] Voting system
- [x] Winner selection
- [x] ⚠️ **Ownership on the decisive routes — was absent, and the gap was shaped like a state check.**
      `ForbiddenException` appeared twenty-five times in `ContestsService` and every one of them was a
      STATE check (`status !== 'voting'`). Four mutating routes had no ownership check at all:
      `selectWinner` and `distributePrize` did not take a **caller identity** — so nothing about WHO
      was asking was recorded, let alone enforced, and any authenticated account could end a contest it
      did not own or mint a prize against it; `approveSubmission` took a `userId` and recorded it as the
      reviewer without ever checking it against `contest.createdBy`; and `rejectSubmission` checked
      nothing at all — not the contest, not the state, not the owner — so it accepted a submission
      against a contest id that need not exist. The lifecycle routes (`update`, `start`, `cancel`,
      `complete`) DID have the check, copied inline five times, which is how the last four went missing.
      It is now one `assertContestOwnership` helper that every mutating route calls, with the caller
      identity threaded through the two routes whose signatures lacked it.
- [x] ⚠️ **Voting integrity — three ways to reach a result that needed no database.**
      - **Self-voting.** `contest_votes_unique_idx` is on `(contest, submission, user)`, which stops a
        DOUBLE vote and not one vote for your own entry — so a two-entrant contest could be won by a
        single person casting both.
      - **Cross-contest voting.** Nothing connected the submission to the contest, so a submission id
        from contest A could be voted on through contest B's route: the vote landed against B while
        pointing at somebody else's story.
      - **Voting never closed.** `status === 'voting'` is set on start and never cleared by the
        passage of time, so `end_date` passing did not close voting. `submitStory` DID enforce
        `end_date`, so submissions closed on time while votes did not — the worse half to leave open,
        because a vote changes a winner.
      A rejected submission is now refused too: it keeps its row and its id, so nothing stopped a
      vote for something the organiser had removed.
- [x] **Unit tests** (`contests.service.spec.ts`) — including twelve cases for the ownership and
      voting guards above, which had none
- [x] **Integration tests** (`contests.controller.spec.ts`)

### Week 12: Contest Features — ✅
- [x] ⚠️ **Prize distribution — the row could not record a prize.** `contest_prizes` carried
      `prize_type varchar(50)` and `prize_description text` only, so a CASH prize had nowhere to go:
      the amount had to live inside a sentence that nothing can sum, filter or compare. "A prize was
      distributed" was recordable; "5000 EGP was distributed" was not. Migration `0022` adds `amount`
      (piastres, matching `books.price` and the Paymob unit) and `currency`, nullable and deliberately
      **un-backfilled** — a figure reconstructed from prose is a guess — so a row from before it reads
      as "value never recorded" rather than "zero", which is the distinction that matters when someone
      reconciles a contest budget. A `CHECK` pairs the two, because an amount with no currency is not an
      amount. `ContestPrize` was a second hand-written copy of the schema's own type and is now
      re-exported from it (Principle #9 — the same drift `ownerId` had in the books module).
- [x] **Badge awards** — ✅ **built.** The `badges` module, the `badges` / `user_badges` tables
      (migration `0013`), award logic, and `GET /api/v1/badges` routes. This was an open roadmap
      item and has shipped
- [x] ⚠️ **Contest notifications — were nine `logger.info` calls and nothing else.** All nine handlers
      existed, each subscribed to a real event, and each logged its line. The notifications table, the
      preferences table and the unread badge all existed; nothing ever wrote to them from a contest, so
      "event-driven" described nine log statements. They notify now, through `NotificationsService` —
      the only path that consults the recipient's preferences — and three decisions are pinned by
      tests: the entry AUTHOR is told, not the contest's organiser, who already sees every entry in the
      dashboard; `contest.created` and `contest.completed` notify **nobody**, because the author just
      did the thing and the winner was already told by `winner.selected`; and a writer with three
      entries is told once when a contest starts rather than three times. The duplicate handler set in
      `notifications.event-handler.ts` that previously subscribed to `winner.selected` and
      `prize.distributed` has been **removed**, so contest notifications are no longer duplicated
- [x] ⚠️ **The public vote tally named every voter.** `GET /contests/:id/votes` is `@Public()` and
      returned every vote's `userId`, so anyone — with no account and no relationship to the contest —
      could enumerate which accounts voted for which submission. On a platform where an account is a
      person, that is a roster of who engaged with what. The count is public product behaviour and
      stays; the identities do not. Nothing consumed the field — the frontend has no caller for this
      route — so it was carrying risk and no reader. An organizer who needs the voters has the
      authenticated publisher dashboard, which already scopes itself to `contest.createdBy`.
- [x] Publisher dashboard — `GET /api/v1/contests/publisher/stats`,
      `publisher/:id/submissions`, `publisher/:id/votes`. ⚠️ the previous line cited
      `contests.controller.ts:179,185,194`; the routes are at `:53,60,69`
- [x] **Unit tests** (prizes, badges)
- [x] **Integration tests** (`src/modules/contests/e2e/contests.e2e-spec.ts`) — ⚠️ its case named
      "should move contest to voting and allow voting" never voted; it asserted the contest reached the
      voting state and stopped

**Exit Criteria — met**, with one correction: "coverage ≥ 85%" is not a configured floor; the
global gate applies.

---

## Phase 6: Moderation (Week 13) — ✅ COMPLETE

### Week 13: Moderation System — ✅
- [x] Reporting system — `POST /api/v1/moderation/reports`; `reports.source` distinguishes
      user-filed from auto-filed reports (migration `0018`)
- [x] Auto-escalation — ✅ `checkAutoEscalation()` is called from `backend/src/modules/moderation/moderation.service.ts:91` on
      report creation, and `autoEscalateReports()` is driven by
      `moderation/escalation.scheduler.ts` on a configurable interval
- [x] Moderation actions — `moderation_actions` table
- [x] User restrictions — `user_restrictions` + `RestrictionGuard`
- [x] Admin dashboard — `GET /api/v1/moderation/stats`, `/reports/trends`, `/actions`,
      `/users/:id/restrictions`
- [x] **Unit tests** (`moderation.service.spec.ts`, `content-moderation.service.spec.ts`)
- [x] **Integration tests** (`moderation.controller.spec.ts`, `test/moderation.integration-spec.ts`)

**Exit Criteria — met.** Moderation was completed out of its nominal order; it is done.

> ✅ **The authorization hole that stood here is closed.** `@RequireAdminRole` was dead metadata —
> no controller applied `RolesGuard`, so any authenticated user could read moderation stats.
> `@Secured()` now wires **all four** guards — `JwtAuthGuard` + `RestrictionGuard` + `RolesGuard` +
> `PermissionsGuard`.

---

## Phase 7: Polish & Launch (Weeks 14–18) — 🔄 IN PROGRESS

### Week 14: Testing & Optimization — 🔄
- [x] **Unit tests** — **151 files / 3270 tests**. Coverage above the gate: **S 84.28 / L 84.45**
      against floors 78 / 79
- [x] **Integration + e2e tests** — **22 files / 186 tests** (10 `src/modules/**/e2e/*.e2e-spec.ts`,
      `test/app.e2e-spec.ts`, and **11** `test/*.integration-spec.ts`). Per-file cloned database.
      ⚠️ **and they only started executing in this change set** — the module-graph blockers above had
      every one of them skipping silently
- [x] **E2E tests** — **frontend only.** `backend/playwright.config.ts` was deleted as orphaned;
      there is no backend browser suite. `frontend/e2e/` holds **3 files / 15 tests**
      (`journeys`, `api-critical-paths`, `accessibility`) — driven by `frontend/playwright.config.ts`,
      which boots both servers itself. The frontend also runs axe-core WCAG 2.0/2.1 A+AA checks
- [x] **Frontend tests** — **62 files / 794 tests**
- [x] Security audit — CI `security` job runs `npm audit --omit=dev` and `npm audit`
- [ ] 🔄 **Load testing — automated in CI via k6.** `load-tests/k6.conf.js` (1000 VUs, p95 threshold)
      is executed by the `load-test` CI job on push to main via `grafana/k6-action@v0.3.0`
- [ ] ⛔ **Payment flow testing against a live sandbox — NOT BUILT.** The Paymob client is
      unit-tested against Zod-validated fixtures; no test has ever hit Paymob's API
- [ ] 🔄 Performance optimization — not a measured activity; there is no benchmark suite

### Week 15: Event Schema Registry — ✅ SHIPPED EARLY
Delivered in the Phase 1–2 window rather than Week 15.
- [x] Event schema registry — `backend/src/common/events/event-schema-registry.ts`
- [x] Dead Letter Queue — `backend/src/common/events/dlq.service.ts`, **with a drain**:
      `GET /events/dlq` and `POST /events/dlq/:id/replay` on `DLQController`
- [x] Event versioning — every one of the **55** names in `EVENT_SCHEMAS` is pinned
      at `v1`; **10** event-constant modules live in `backend/src/common/events/` and **17** files
      contain `@OnEvent` under `backend/src/modules/` (16 in a `*/events/` directory, plus
      `stories/sanity/sanity-sync.event-handler.ts`). Two names (`user.updated`, `refund.completed`)
      are registered with **no producer** and are listed in `REGISTERED_WITHOUT_PRODUCER`;
      `event-schemas.spec.ts` fails if a third appears
- [x] Event validation — `event-validator.service.ts`
- [x] **Unit tests** (event bus)

### Week 16: Read Replicas & Resilience — 🔄 HALF BUILT
- [ ] ⛔ **Read replica — NOT BUILT.** `grep -rni "replica" backend/src` returns nothing
- [ ] ⛔ **Read/write splitting — NOT BUILT**
- [ ] ⛔ **Replication lag monitoring — NOT BUILT**
- [x] **Circuit breakers for external services** — ✅ now **wired**, not dead code:
      `CircuitBreakerService` is injected into `backend/src/modules/auth/auth.service.ts:59` and
      `stories/sanity/sanity.service.ts`
- [x] **Retry logic with exponential backoff** — `RetryService`, used by `ResilientHttpClient`
- [x] **Timeout configuration** — `TimeoutService` + `DEFAULT_OPERATION_TIMEOUT_MS`
- [x] **Fallback strategies** — `FallbackService`
- [x] **Integration tests** (circuit breakers, retry, timeout, fallback)

### Week 17: Documentation & Deployment — 🔄
- [x] API documentation (OpenAPI) — `@nestjs/swagger`, served at `/api/docs` and `/api/docs-json`
- [x] Deployment guides — `docs/deployment/*`
- [ ] ⛔ **User documentation — NOT COMPLETE.** `docs/user/` contains `help-centre.md`,
      `getting-started.md`, and `faq.md`, but these are not comprehensive user-facing docs
- [x] ✅ **Production Dockerfiles exist** — multi-stage builds at the repo root, `./backend/Dockerfile`,
      and `./frontend/Dockerfile`. A deploy workflow exists in `.github/workflows/deploy.yml` that builds
      and pushes images from `./backend/Dockerfile` and `./frontend/Dockerfile`; there is no staging or
      production manifest/IaC
- [x] Monitoring setup (Sentry + Winston) — `@sentry/nestjs@11.1.0`,
      `common/observability/sentry.config.ts`
- [ ] 🔄 **Backup strategy — automated via GitHub Actions.** `.github/workflows/backup.yml` runs
      `pg_dump` daily at 2 AM UTC and uploads as an artifact. No PITR is configured

### Week 18: Final Testing & Launch — 🔄
- [x] Full regression testing — CI runs **12 jobs** on every push and PR: `lint`, `test-unit`,
      `test-frontend`, `test-coverage`, `test-e2e`, `test-browser`, `migration-premerge`,
      `migration-verify`, `migration-roundtrip`, `security`, `build`, `load-test`.
- [ ] ⛔ **Security penetration testing — NOT BUILT.** No pentest report, no external engagement
- [ ] ⛔ **Performance benchmarking — NOT BUILT.** No benchmark harness
- [ ] 🔄 **Load testing — automated in CI via k6.** `load-tests/k6.conf.js` is executed by the
      `load-test` CI job on push to main
- [ ] ⛔ **Staging deployment — NOT BUILT**
- [ ] 🔄 **Production deployment — deploy workflow and per-service Dockerfiles exist, but there is no
      staging or production manifest/IaC.** `.github/workflows/deploy.yml` builds and pushes
      `ghcr.io/${{ github.repository }}-backend` and `-frontend` images on push to main from
      `./backend/Dockerfile` and `./frontend/Dockerfile`. A root `Dockerfile` also exists for
      local/production image builds, but it is not referenced by `deploy.yml`
- [ ] ⛔ **Post-launch monitoring — NOT BUILT** (Sentry is wired, but there is no deployed instance
      to monitor)
- [ ] 🔄 **User documentation — PARTIAL.** `docs/user/` has starter content; comprehensive help
      centre and onboarding are missing

**Exit Criteria — status:**

| Exit criterion | Status |
|---|---|
| All tests pass (unit, integration, E2E) | ✅ 151 unit files / 3270 tests · 22 e2e + integration files / 186 tests · 62 frontend files / 794 tests · 3 Playwright files / 15 tests |
| Code coverage ≥ 80% | ✅ backend **S 84.28 / B 80.49 / F 78.86 / L 84.45** against floors 78/73/70/79 + 9 ratchets; ⚠️ frontend **S 68.39 / L 68.17**, with the gate set to 38/38 rather than the target |
| Payment E2E tests pass | ✅ against fixtures; ⛔ never run against a live sandbox |
| Performance targets met (< 200ms p95) | ⛔ not measured — no benchmark harness |
| Security audit passed | ✅ CI `npm audit` job; ⛔ no pentest |
| Load testing passed (1000 concurrent users) | 🔄 k6 config executed in CI via `load-test` job on push to main |
| Monitoring dashboards active | 🔄 Sentry wired; ⛔ no dashboards defined in the repo |
| Backup strategy implemented | 🔄 automated via GitHub Actions (daily `pg_dump`); ⛔ no PITR |

**Deliverables — status:**

| Deliverable | Status |
|---|---|
| Production-ready application | 🔄 feature-complete; per-service Dockerfiles and deploy workflow exist, but no staging/production IaC |
| Full test coverage | ✅ **3270** backend unit (151 files) + **186** backend e2e/integration (22 files) + **794** frontend (62 files) + **15** Playwright (3 files) = **4265 tests** |
| Complete documentation | 🔄 `docs/` reconciled; user docs partial |
| Live deployment | ⛔ none |
| Monitoring and alerting | 🔄 Sentry + structured logs; ⛔ no alerting rules deployed |

---

## Milestones

| Milestone | Week | Deliverable | Exit Criteria | Status |
|---|---|---|---|---|
| **M1: Foundation** | 2 | Auth + Database + Infrastructure | Tests passing, coverage ≥ 80% | ✅ met |
| **M2: Core Content** | 5 | Users + Stories + Search | Stories can be published | ✅ met |
| **M3: Social** | 7 | Interactions + Notifications + Messages | Social features working | ✅ met |
| **M4: Books & Sales** | 9 | Books + Sales + Rentals | Books can be purchased | ✅ met |
| **M5: Payments** | 10 | Payment integration + E2E | Payment flows tested | ✅ met (fixtures) |
| **M6: Contests** | 12 | Contest system complete | Contests working | ✅ met |
| **M7: Moderation** | 13 | Moderation system | Content moderation working | ✅ met |
| **M8: Production** | 18 | Fully tested and deployed | All exit criteria met | ⛔ not met |

---

## Phase Exit Criteria (NFR Checklist)

This table records **what was actually achieved**, not what was planned. A ✅ means the criterion
holds today; a ⛔ means it was never satisfied.

| NFR | P1 | P2 | P3 | P4 | P5 | P6 | P7 |
|---|---|---|---|---|---|---|---|
| **Code coverage ≥ 80%** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔄 backend ✅ / frontend ⚠️ |
| **All tests pass** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **No critical bugs** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔄 |
| **API response < 200ms (p95)** | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ never measured |
| **Security audit passed** | ⛭️ | ⛭️ | ⛭️ | ⛭️ | ⛭️ | ✅ | 🔄 CI audit only |
| **Performance tests passed** | ⛭️ | ⛭️ | ⛭️ | ⛭️ | ⛭️ | ⛭️ | ⛔ no harness |
| **Load testing passed** | ⛭️ | ⛭️ | ⛭️ | ⛭️ | ⛭️ | ⛭️ | 🔄 k6 config executed in CI via `load-test` job |
| **Monitoring configured** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔄 Sentry, no dashboards |
| **Backup strategy implemented** | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | 🔄 automated via GitHub Actions (daily `pg_dump`); ⛔ no PITR |
| **Circuit breakers configured** | ⛭️ | ⛭️ | ⛭️ | ✅ | ✅ | ✅ | ✅ |

**Legend:** ✅ satisfied · 🔄 partial · ⛭️ was not required for this phase · ⛔ required (or claimed)
and never satisfied.

---

## Critical Path (High-Risk Items)

### Payment Integration (Weeks 10–11)
**Risk:** High — external dependency, financial transactions
**Outcome:** ✅ Mitigated. The client is real, responses are Zod-validated, the auth token is cached,
retries and circuit breaking are in front of it, and a failure produces a 503 with the local
payment marked `failed` rather than a fabricated URL.
**Residual risk:** ⛔ never exercised against a live sandbox.

### Sanity CMS Integration (Week 4)
**Risk:** Medium — external dependency
**Outcome:** ✅ Wrapped in `CircuitBreakerService` with a PostgreSQL fallback path.
**Residual risk:** the fallback's completeness is untested.

### Testing (All Phases)
**Risk:** High
**Outcome:** ✅ **4265 tests across four suites** — 3270 backend unit (151 files) + 186 backend
e2e/integration (22 files) + **794** frontend (**62** files) + 15 Playwright (3 files), all green, with a hard
CI gate and a per-file cloned test database.
**Residual risk:** ⛔ **the integration suite had never executed** before this change set — the
module-graph blockers made all 11 `test/*.integration-spec.ts` files skip themselves while CI stayed
green. A green suite proves nothing if the suite did not run. ⚠️ frontend coverage is S 68.39 / L 68.17,
below the 80% target — and the frontend gate is set to 38/38, so it certifies roughly 68% rather
than failing on the gap.

---

## Risk Management

| Risk | Probability | Impact | Mitigation | Status |
|---|---|---|---|---|
| **Payment gateway issues** | Low | High | Zod-validated client, cached auth token, circuit breaker, retry, clean 503 failure | 🔄 untested live |
| **Sanity CMS integration** | Medium | High | Circuit breaker, PostgreSQL fallback | ✅ |
| **Performance bottlenecks** | Medium | Medium | Cache-aside + tagged invalidation; read replicas and load testing never built | ⛔ unmitigated |
| **Security vulnerabilities** | Low | High | WAF (34 rules, 8 layers), rate limiting (4 tiers), fail-closed guards, `npm audit` in CI | 🔄 no pentest |
| **Testing delays** | Medium | High | TDD, CI on every PR | ✅ — but see the retired *silent suite skip* hazard in `risks.md` |
| **Scope creep** | High | Medium | Phase boundaries | ✅ |
| **Migration data loss** | Low | High | **sha256 ledger, transaction wrapping, reversibility classification** — 0 irreversible, 18 data-loss, 4 reversible across the 22 down scripts | ✅ materially reduced |

---

## Success Criteria — actual state

### Functionality
- ✅ All core features working (22 backend modules, 33 tables, 24 controllers)
- ✅ Payment flows implemented and unit-tested
- ✅ Sanity CMS integrated
- ✅ Search working
- ✅ Notifications working
- ✅ Messaging working

### Performance
- ⛔ Page load < 3s — never measured
- ⛔ API response < 200ms (p95) — never measured
- ✅ Cache hit rate is **instrumented** at `GET /api/v1/metrics/cache`; the > 90% target is ⛔ not
      measured
- ⛔ Database query < 50ms (p95) — never measured

### Security
- ✅ CI `npm audit` job passes
- ⛔ No external pentest
- ✅ WAF configured — 34 rules, 8 layers
- ✅ Rate limiting active — 4 tiers, Valkey-backed
- ⚠️ Encryption at rest (AES-256-GCM) and in transit (TLS, if the platform terminates it) —
      the app itself has no HTTPS redirect or `trust proxy`

### Quality
- ✅ Backend coverage above the gate (**S 84.28 / B 80.49 / F 78.86 / L 84.45** against floors
      78/70/73/79)
- ⚠️ All tests pass (unit, integration, E2E) ✅; ⛔ frontend coverage is **68.39** statements /
      **68.17** lines, below the 80% target and above its own 38/38 gate
- ✅ Payment E2E tests exist
- ✅ Code review coverage — enforced by the **12-job** CI pipeline

### Reliability
- ⛔ Uptime > 99.9% — not deployed, so not applicable
- 🔄 Backup strategy automated via GitHub Actions (daily `pg_dump`); ⛔ no PITR
- ✅ Monitoring configured (Sentry + Winston + WAF logs + cache metrics)
- 🔄 Alerting — `monitoring/alert-rules.yml` exists but is not deployed or wired to any alertmanager
- 🔄 Disaster recovery plan documented; ⛔ no restore drill, no backup artifact

### Documentation
- ✅ API documentation (OpenAPI, served live)
- ✅ Architecture documentation
- ⚠️ Deployment guides describe a containerised deploy with a `Dockerfile` that exists but is not
      used by any CI workflow
- 🔄 User documentation — `docs/user/` has starter content; comprehensive help centre and onboarding
      are missing

---

## Timeline Summary

```
Phase 1: Foundation         (Weeks 1-2)   ← Auth, Database, Infrastructure        ✅
Phase 2: Core Domain        (Weeks 3-5)   ← Users, Stories, Search                ✅
Phase 3: Social Features    (Weeks 6-7)   ← Interactions, Notifications, Messages ✅
Phase 4: Books & Commerce   (Weeks 8-10)  ← Books, Sales, Rentals, Payments       ✅
Phase 5: Contests           (Weeks 11-12) ← Contests, Voting, Prizes, Badges     ✅
Phase 6: Moderation         (Week 13)     ← Moderation system                    ✅
Phase 7: Polish & Launch    (Weeks 14-18) ← Testing, Resilience, Deployment      🔄
```

**Total: 18 weeks (4.5 months). Phases 1–6 are complete. Phase 7 is the only open phase, and its
open items are all infrastructure/operations, not product features.**

---

## Post-Launch Roadmap

Deferred past the 18-week window. None of these is built; they are listed so the roadmap does not
silently lose them.

- Performance optimisation based on real usage
- Cache tuning
- Database query optimisation
- Read replica scaling
- PWA support
- Mobile app (React Native)
- Advanced analytics
- Recommendation engine
- Microservices extraction (if needed)
- Multi-region deployment
- CDN for static assets
- Advanced monitoring (Prometheus, Grafana)

---

## Open Items — the complete list of ⛔ work

Everything the roadmap claims and the repository does not contain:

1. **Read replicas** and **read/write splitting** (Phase 7, Week 16)
2. **Replication lag monitoring** (Phase 7, Week 16)
3. **Load testing in CI** — `load-tests/k6.conf.js` is executed by the `load-test` CI job on push to
    main via `grafana/k6-action@v0.3.0` (Phase 7, Weeks 14, 18)
4. **Performance benchmarking** — no harness; the p95 targets were never measured (Phase 7, Weeks 14, 18)
5. **Staging and production deployment** — per-service Dockerfiles exist (`./backend/Dockerfile`,
       `./frontend/Dockerfile`) and a deploy workflow exists (`.github/workflows/deploy.yml`), but there
       is no staging/production manifest or IaC (Phase 7, Week 18)
6. **Backup automation** — `.github/workflows/backup.yml` runs `pg_dump` daily at 2 AM UTC and uploads
    as an artifact. No PITR is configured (Phase 7, Week 17)
7. **Alerting deployment** — `monitoring/alert-rules.yml` exists but is not deployed or wired to any
    alertmanager (M8 success criteria)
8. **User documentation** — `docs/user/` contains starter content but comprehensive help centre,
      onboarding guide, and contextual help are missing (Phase 7, Weeks 17, 18)
9. **Security penetration testing** (Phase 7, Week 18)
10. **Live-sandbox payment testing** (Phase 7, Week 14)
11. **Email delivery** — `EMAIL_*` config exists but no SMTP client is wired; only `EMAIL_FROM` is read
12. **MFA / TOTP** — see `docs/security-architecture/auth/auth-overview.md`
13. **Account lockout** after failed logins — see the same document
14. **Permission-decision audit trail** — see `docs/security-architecture/permissions/permissions-overview.md`
15. **WAF admin operations endpoints** (`GET /admin/waf/blocked-ips` and friends)
16. **Machine-readable error codes** and custom exception classes — see `docs/api-contract/error-handling.md`
17. **Frontend coverage** at the 80% target — ⚠️ currently **S 68.39 / B 68.75 / F 70.97 / L 68.17**,
      with the CI gate set to 38/33/33/38, so it certifies ~68% instead of holding the line at 80%
18. **Social UI call sites for follow/react/comment** — the client methods are correct and pinned to
      the backend controllers, and `/stories/[id]/comments`, `/stories/[id]/reactions`,
      `/users/[id]/followers`, and `/users/[id]/following` are now **functional read-only server
      components** that call the API directly (`api.getComments(id)`, `api.getReactions(id)`,
      `api.getFollowers(id)`, `api.getFollowing(id)`)
19. **Session store** — no server-side session record; the client authenticates on a 15-minute
      httpOnly cookie
20. **Resource quotas** — no per-account storage/posting/rate quota beyond request throttling
21. **Write-through caching and cache warming** — `@CacheWarmTags` has **no caller**
22. **Consistency-violation detection and compensation mechanisms** — no reconciliation between the
      event bus and the rows it is supposed to produce
23. **Plugin architecture** — no extension point of any kind

---

## Related Documentation

- Testing Strategy: `docs/testing/testing-strategy.md`
- Event Schema Registry: `docs/module-boundaries/events/event-schema-registry.md`
- Read Replica Strategy: `docs/system-architecture/infrastructure/read-replicas.md`
- NFRs: `docs/system-architecture/non-functional-requirements.md`
- Payment System: `docs/module-boundaries/payments/payment-system.md`
- Milestones: `docs/roadmap/milestones/milestones.md`
- Deliverables: `docs/roadmap/deliverables/deliverables.md`
- Risks: `docs/roadmap/risks.md`

---

## Changelog — reconciliation (2026-09-30)

| Problem | Resolution |
|---|---|
| Every checkbox `- [ ]` was unchecked, including Phases 1–3, while `deliverables.md` marked Phases 1–3 ✅ and Phases 5–6 ⏳ Not Started. Both documents were wrong | This file is now the single status source. Phases 1–6 ✅ complete, Phase 7 🔄 in progress. All four sibling roadmap documents were aligned to it |
| Week ranges disagreed: Phase 4 = 8–10 (here) vs 9–11 (three other files); Phase 5 = 11–12 (here) vs 12–13 (three other files) | Adopted **this file's** ranges: P1 1–2, P2 3–5, P3 6–7, P4 8–10, P5 11–12, P6 13, P7 14–18. 18 weeks total |
| `milestones.md` had 6 milestones ending week 16; this file had 8 ending week 18 | Adopted **8 milestones ending week 18** (M1–M8), because it maps 1:1 onto the seven phase boundaries |
| Coverage targets disagreed: "90% auth/payments + 80% other" vs "≥ 80% everywhere" | Adopted **≥ 80% everywhere**, and stated the actual configured CI floors (79/70/73/78 + 9 per-path ratchets) so the target and the gate are not confused |
| Open roadmap items that had shipped were still unchecked | Checked: `POST /users`, `DELETE /users/:id`, the `isVerified` write path, content moderation hooks, badge awards, the event schema registry, the DLQ, and the resilience primitives |
| Open roadmap items that never shipped were mixed in with completed work | Listed exhaustively in **Open Items** above — 18 items at the time of that pass, each with the file that proves it is absent. **The list has since grown to 27** — see the 2026-10-04 changelog below |

---

## Changelog — reconciliation (2026-10-04)

Every figure in this document was re-derived against the tree rather than carried forward. **This is
the second pass; the first was 2026-09-30 and it did not survive contact with a test run.**

### Numbers that were wrong and are now measured

| Was | Now | How to re-derive |
|---|---|---|
| 145 unit files / 3047 tests | **151 files / 3270 tests** | `npm test --workspace=backend` |
| 22 e2e files / 136 tests | **22 files / 186 tests** — 10 `src/**/e2e/*.e2e-spec.ts` + 1 `test/app.e2e-spec.ts` + **11** `test/*.integration-spec.ts` | `npm run test:e2e --workspace=backend` |
| backend coverage S 85.43 / B 82.39 / F 79.00 / L 85.58 | **S 84.28 / B 80.49 / F 78.86 / L 84.45** — **all four were wrong** | `backend/coverage/coverage-summary.json` |
| frontend coverage S 39.79 / B 35.90 / F 35.74 / L 40.22 | **S 68.39 / B 68.75 / F 70.97 / L 68.17** — **all four were wrong** | `frontend/coverage/coverage-summary.json` |
| frontend tests 21 files / 340 | **62 files / 794** | `npm run test:run --workspace=frontend` |
| Playwright "real browser tests in `backend/` and `frontend/`", 2 files / 9 tests | **frontend only**, **3 files / 15 tests**. `backend/playwright.config.ts` is deleted | `ls frontend/e2e/` |
| "10 jobs" (Week 18 exit criteria, Quality section) / "10 jobs" | **12 jobs** — `migration-roundtrip` and `load-test` were missing from the list | `awk '/^jobs:/{f=1;next} f&&/^  [a-z-]+:/{print}' .github/workflows/ci.yml` |
| "3523 tests across three suites (3047 + 136 + 340), plus 9 Playwright" | **4265 across four suites** (3270 + 186 + 794 + 15) | sum of the rows above |
| "1792 unit + 146 e2e + 340 frontend tests" | **3270 / 186 / 794** | same |
| "23 database-backed integration files" (the total was right, the breakdown was not) | **22 files = 10 e2e in `src` + 1 app e2e + 11 integration** | `ls backend/test/*.integration-spec.ts` → 11 |
| `@Secured()` composing 3 guards | **4**: `JwtAuthGuard` + `RestrictionGuard` + `RolesGuard` + `PermissionsGuard` | `secured.decorator.ts:31` |
| "16 `@OnEvent` handler files under `backend/src/modules/*/events/`" | **17 files** contain `@OnEvent`: 16 in `*/events/` directories plus `stories/sanity/sanity-sync.event-handler.ts` | `grep -rl "@OnEvent" backend/src/modules \| wc -l` |
| `backend/src/app.controller.ts:31-27` (health) | **`app.controller.ts:62-73`**, payload `:67-72`, `degraded` at `:68`. The old citation was a backwards, non-existent range | read the file |

### Claims that were false and are now corrected

| Was | Reality |
|---|---|
| "**Vitest** (not Jest/Supertest)" | Half false. Jest is genuinely absent — no `jest` dependency, config or types in any `package.json`. **Supertest is present** (`backend/package.json:112`) and is imported by **34** files under `backend/src/` and **12** under `backend/test/`; **23 of the `src/` side** run in the unit job |
| "the DLQ has **no drain** … a dead-lettered event is never redelivered" | **False.** `DLQController` serves `GET /events/dlq` and `POST /events/dlq/:id/replay`; `replayDeadLettered` re-validates against the registered schema and re-emits. `retryDLQ` is **deleted**. `getDLQStats` is the only remaining spec-only method |
| "`0001` is deliberately irreversible because it owns `uuid-ossp`" (asserted in `docs/roadmap/risks.md`) | **False.** All **22** down scripts classify: **0 irreversible, 18 data-loss, 4 reversible** (`0014`, `0020`, `0021`, `0022`). `0001_create_stories_tables.down.sql` declares `reversibility=data-loss`, and its down script never drops `uuid-ossp` — which was the entire stated reason |
| Two module-graph bugs recorded nowhere while every phase below reads ✅ | `BooksModule` ↔ `LibraryModule` had no `forwardRef()` — **the backend could not boot**, and all 11 integration specs plus the stories e2e **skipped silently with CI green**. `ContestsModule` imported `NotificationsModule` without listing it. Both fixed; 8 never-run tests then failed on stale fixtures and were fixed |
| `npm run migration:status` documented at the repo root in 8 documents | The script **did not exist at the root** before this change set. It does now (`package.json:22`) |

### Corrected feature claims, recorded where they belong
Phase 2: the anonymous draft dump on `GET /stories`, the two public detail routes that returned drafts,
`sortBy: 'relevance'` never having been implemented, `sortBy` missing from the search cache key,
`view_count` having no HTTP writer, and the frontend sending `q=` where the DTO field is `query` — every
search from the web client was a 400. Phase 3: twelve client methods pointing at routes that do not
exist, the doubled `messages/messages/:messageId` path, duplicated notification routes, comment
reactions written as `story_reaction`, and the contest handlers bypassing `NotificationsService`. Each is
written up in its own phase, not here.

**One defect is recorded rather than fixed**, per instruction: `contests.event-handler.ts` and
`notifications.event-handler.ts` both subscribe to `winner.selected` and `prize.distributed`, so a
contest winner receives **two** notification rows for each. One side must be declared canonical.

### Unchanged, and re-verified rather than assumed
Coverage floors **79 / 70 / 73 / 78** and **9** per-path ratchets · frontend gate **38 / 33 / 33 / 38** ·
**33** `CREATE TABLE` · **35** WAF rules with **34** active by default · **55** `EVENT_SCHEMAS`, all
`v1` · **10** event-constant modules · no `EventBusModule` · no `it.fails` anywhere in the repository.

---

*This document defines the implementation roadmap for Hakawi.*
