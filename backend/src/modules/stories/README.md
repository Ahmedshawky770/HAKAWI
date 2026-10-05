# Stories Module

## Overview

The Stories module handles all story-related operations in the Hakawi platform, including CRUD operations, publishing workflow, and integration with Sanity CMS.

## Architecture

This module follows the project's 17 architecture principles:

- **Loose Coupling**: Uses repository pattern and event-driven communication
- **SSOT**: Stories are authored in PostgreSQL, with optional Sanity CMS sync
- **Valkey Cache**: Story reads are cached for performance
- **Event-Driven**: Emits events for story lifecycle (created, updated, published, archived, deleted)

## Database Schema

### stories

- `id` (UUID, PK)
- `authorId` (UUID, FK to users)
- `title` (varchar 255)
- `slug` (varchar 255, unique)
- `excerpt` (text, nullable)
- `content` (text, nullable)
- `coverImage` (text, nullable)
- `status` (draft/published/archived)
- `categoryId` (UUID, FK to categories, nullable)
- `viewCount`, `likeCount`, `commentCount` (integer)
- `readingTime` (integer, nullable)
- `publishedAt` (timestamp, nullable)
- `deletedAt` (timestamp, nullable)
- `createdAt`, `updatedAt` (timestamps)

### Related Tables

- `categories` - Story categories
- `tags` - Story tags
- `story_tags` - Many-to-many relationship between stories and tags

## API Endpoints

| Method | Endpoint             | Description                                        |
| ------ | -------------------- | -------------------------------------------------- |
| GET    | /stories             | Published stories only (pagination/filters)        |
| GET    | /stories/mine        | Caller's own unpublished stories (auth required)   |
| GET    | /stories/:id         | Get story by ID (unpublished: author/moderator)    |
| GET    | /stories/slug/:slug  | Get story by slug (unpublished: author/moderator)  |
| POST   | /stories             | Create new story (auth required)                   |
| PATCH  | /stories/:id         | Update story (auth required, **author only**)      |
| POST   | /stories/:id/publish | Publish story (auth required, **author only**)     |
| POST   | /stories/:id/archive | Archive story (auth required, **author only**)     |
| DELETE | /stories/:id         | Soft delete story (auth required, **author only**) |
| POST   | /stories/:id/view    | Count one view (auth required, **any reader**)     |

Route order is load-bearing: every literal segment (`mine`, `slug/:slug`) is declared **above**
`@Get(':id')`. Nest registers Express routes in declaration order, so `@Get(':id')` would bind
`id="mine"`, Postgres would raise `22P02` on the uuid cast (swallowed to `null`), and the route would
answer 404 for an author who has drafts.

### The public list only ever returns published stories

`GET /stories` is `@Public()`, so `status` is **pinned to `published`** by
`StoriesController.findAll` and never read from the query string — the same rule `GET /search`
applies, and both routes read it from the one `PUBLIC_STORY_STATUS` constant in `types.ts`. Before
this, the route forwarded the caller's `status` into `WHERE status = $1`, which made
`?status=draft` an anonymous dump of every draft in the system. `status` remains on
`StoriesQueryDto` and is whitelisted, so a value outside the lifecycle is a 400 rather than a 200
that silently ignores the caller's typo.

### An author's own drafts: `GET /stories/mine`

Pinning the list closed the leak and left a broken feature behind it — `POST /stories` answers 201
with the new id and nothing could list it again. `StoriesRepository.findAll` and `StoriesService.findAll`
already accepted `authorId`; no route reached them. `GET /stories/mine` is that route.

- **A separate route, not an `authorId` field on the public list.** `GET /stories` is `@Public()`. An
  `authorId` query field there is the same shape as the leak that was just closed: a caller-supplied
  identity in the query string, forwarded to `WHERE author_id = $1`. It is safe only if the route
  ignores the parameter and takes the author from the token — and then the field's meaning depends on
  a guard rather than on the type, so one forgotten `@UseGuards` re-opens it. On its own route the
  property is structural: `JwtAuthGuard`, and `MyStoriesQueryDto` declares no `authorId` at all, so
  `?authorId=<uuid>` is a 400 from `forbidNonWhitelisted`, never a successful lookup.
- **The author is the verified subject.** `StoriesController.findMine` forwards `req.user.sub` and
  nothing else; `StoriesService.findUnpublishedByAuthor` decides what "unpublished" means and defaults
  to `UNPUBLISHED_STORY_STATUSES` (Principle #7).
- **Unpublished = `draft` + `archived`**, derived from `BACKEND_STORY_STATUSES` minus
  `PUBLIC_STORY_STATUS`. A set, not `status <> 'published'`: an exclusion widens by itself when the
  lifecycle grows a value, a set has to be reclassified deliberately. `?status=draft|archived` narrows;
  `?status=published` is a 400 naming `GET /stories`, which answers that question.
- **One query.** `findAll`'s `status` accepts one status or a set, so the unpublished set is a single
  `IN (...)` predicate. Two queries merged in the service cannot work: `total` and the page window share
  one `whereClause` and would stop describing the same row set. `findAll` also gained
  `created_at DESC` as a tie-break, because `published_at` is NULL for every row this route returns and
  OFFSET pagination over a non-deterministic order repeats and skips rows.

### The detail routes do not serve unpublished work either

`GET /stories/:id` and `GET /stories/slug/:slug` are `@Public()` and were filtering only on
`deletedAt`, so any draft or archived story was readable **by id and by slug, with no account** while
the list beside them was already pinned to `published`. One rule, two answers.

The rule now, in one place — `assertStoryIsReadableBy` in `story-visibility.ts`, called by
`StoriesService.findById` and `findBySlug` beside the `deletedAt` check, for both keys:

| Viewer                                         | `published` | `draft` / `archived` |
| ---------------------------------------------- | ----------- | -------------------- |
| nobody (anonymous)                             | 200         | **404**              |
| the story's author                             | 200         | 200                  |
| `content:moderate` (admin / content_moderator) | 200         | 200                  |
| anyone else, authenticated or not              | 200         | **404**              |

That table governs **three** paths, not two: `findById`, `findBySlug`, and `incrementViewCount` all
call the same helper. `POST /stories/:id/view` used to take no viewer at all and incremented for any
id that existed, so a 204 confirmed that a draft existed to any account that cared to ask — the same
disclosure through a cheaper write route. It now forwards the verified viewer and runs
`assertStoryIsReadableBy` before the counter, so the refusal is the same `Story not found` 404 an id
that never existed produces. A **published** story is unaffected: it is readable by anyone, so any
authenticated reader still counts a view on one, which is the ordinary case.

- **404, not 403.** A 403 answers "does this id hold unpublished work?" with yes, and turns the route
  into an oracle for enumerating other people's drafts by status code alone. The denial message is
  the same `Story not found` a nonexistent id produces.
- **The check is in the service, not the controller.** The controller only forwards the viewer it
  resolved; the rule belongs beside the delete filter so every caller — HTTP or internal — gets one
  answer (Principle #7).
- **After the cache, deliberately.** `TaggedCacheService.getOrSet` returns a hit without running
  `load`, so a check inside `load` would run on cold reads only: the author's own read would cache
  the draft and every later anonymous read would be served from cache without the check ever running.
  Running the rule on the returned value makes it hit-or-miss.
- **Moderation authority comes from `resolvePermissions(...).has(CONTENT_MODERATE)`**, the same
  permission table `PermissionsGuard` reads, so there is no parallel role list to drift.
- **`OptionalJwtAuthGuard`, not `JwtAuthGuard`,** resolves the viewer on these routes:
  `JwtAuthGuard` returns early on `@Public()` and never populates `request.user`, so it cannot
  distinguish anonymous from author. A missing credential is allowed, and a credential that is present
  but does not verify is treated as **no** credential rather than as a 401 — the browser holds a
  15-minute `access_token` cookie, so a 401 here would sign every reader out mid-read (see the guard).
  `JwtAuthGuard` still answers 401 on every route that requires authentication, `GET /stories/mine`
  among them.
- **Not a blanket 404.** The shipped edit page and the publish/archive flows read these routes, so
  refusing every unpublished story would have broken a working feature to close the leak.

### View counting

`POST /stories/:id/view` is the only HTTP writer of `stories.view_count`; before it existed the column
was permanently 0 in production while `deliverables.md` documented view tracking as shipped.

- **Auth required, any reader.** Not `OwnershipGuard`: the author is the one reader whose view is not
  evidence of anything, and gating on ownership would make "who may inflate this number" depend on the
  row being inflated. Not `@Public()` either: this is a write, and letting the anonymous read
  population write buys an attacker more damage per request for the same throttle budget.
- **`@ThrottleTier('search')`** — the loosest non-punitive tier (50/min, no block window), so
  browsing is never locked out while a flood stays bounded. Kept after the visibility change.
- **The read rule applies here too.** The handler forwards the verified viewer and
  `StoriesService.incrementViewCount` runs `assertStoryIsReadableBy` beside its `deletedAt` check, so
  an unreadable story answers the same `Story not found` 404 the detail routes give. A published story
  is readable by anyone, so any authenticated reader still counts a view on one.
- **204, no body.** Re-reading the row to return the new count would make the most frequent request in
  the module cost two statements.
- **No deduplication.** A reload counts again. Per-(reader, story) dedup needs a sightings table,
  which is a migration. The counter is a popularity signal and is treated as such.
- **A view does not sweep the search cache.** It invalidates only that story's two keys, so the search
  index is not emptied by page views; cached search pages lag the counter by at most
  `SEARCH_CACHE_TTL_SECONDS`. Content writes still sweep.

### Author-only write routes

The four routes that address an existing story carry `OwnershipGuard`, bound to
`StoryOwnershipResolver` via `OWNERSHIP_RESOLVER` in `StoriesModule`. The guard resolves
`stories.authorId` through `STORIES_REPOSITORY.findById` before the handler runs, so a non-author
never reaches `StoriesService`.

`StoryOwnershipResolver` reads the repository directly rather than `StoriesService.findById`, because
that service reads through `TaggedCacheService` and the cache is fail-open by design — the right
trade for a page render, the wrong one for the input that decides who may delete a story.

The four routes above that address an existing story are the ownership-gated ones. `POST /stories/:id/view`
is authenticated but deliberately NOT ownership-gated; see the view-counting note.

`StoriesService.update/publish/archive/delete` still compare `authorId` as a second line and still own
the states the guard cannot see (already published, already archived, slug conflict). A nonexistent or
soft-deleted id answers 403 from the guard rather than 404 from the service, so the route does not
confirm whether a given story id exists. `POST /stories` is ungated: it addresses no existing resource.
See `src/common/guards/README.md`.

## Publishing Workflow

1. **Draft** - Story is created as draft
2. **Published** - Author publishes story, setting `publishedAt`
3. **Archived** - Story is archived (cannot be republished)

## Events

- `story.created` - Emitted when a story is created
- `story.updated` - Emitted when a story is updated
- `story.published` - Emitted when a story is published
- `story.archived` - Emitted when a story is archived
- `story.deleted` - Emitted when a story is soft-deleted

## Sanity CMS Integration

Sanity sync is optional and enabled when `SANITY_PROJECT_ID` environment variable is set. The `SanitySyncEventHandler` listens to story events and syncs them to Sanity.

## Testing

- Unit tests: `stories.service.spec.ts`, `controllers/stories.controller.spec.ts`,
  `dto/stories.dto.spec.ts`, `repositories/stories.repository.spec.ts`
- E2E tests: `e2e/stories.e2e-spec.ts`
- Integration tests: `test/stories.integration-spec.ts` (the unpublished-content contract on every
  read route, on `POST /stories/:id/view`, and on `GET /stories/mine`)

## Dependencies

- `CategoriesModule` - For category management
- `TagsModule` - For tag management
- `CommonModule` - For shared services (logger, valkey, event emitter)
