# `common/guards` — who is allowed to do what

Five guards in `CommonModule` plus one that is registered by the module that needs it, one rule: **a
guard that cannot establish the caller's right to the resource must deny.** Everything below follows
from that.

`@Secured()` composes exactly **four** of them — `JwtAuthGuard` → `RestrictionGuard` →
`RolesGuard` → `PermissionsGuard` (`SECURED_GUARDS` in `secured.decorator.ts`). `OwnershipGuard` is
applied per route with `@UseGuards`, and `OptionalJwtAuthGuard` is registered by its consuming
module; neither is composed by `@Secured()`.

| Guard                   | Question it answers                            | Wired                                        |
| ----------------------- | ---------------------------------------------- | -------------------------------------------- |
| `JwtAuthGuard`          | Is there a verified token, and who is it?      | `@UseGuards`, per route                      |
| `RolesGuard`            | Is the account type / admin role sufficient?   | `@Secured`, per route                        |
| `PermissionsGuard`      | Is the granted permission set sufficient?      | `@Secured` (via `SECURED_GUARDS`)            |
| `OwnershipGuard`        | Is the caller the owner of _this_ resource?    | applied per route — see below                |
| `RestrictionGuard`      | Is the account restricted (ban / mute)?       | `@Secured` (via `SECURED_GUARDS`) — see below |

All five are provided **and exported** by `CommonModule`, so `@UseGuards(SomeGuard)`
resolves from any module. `common.module.spec.ts` pins that list; it is the exact property
whose absence made `OwnershipGuard` dead code, and then `RestrictionGuard` — the second
guard to be documented as live while being wired to nothing.

`restriction-guard.wiring.spec.ts` closes the loop the module spec cannot: it drives real
HTTP through a `@Secured` route and asserts a banned account is refused. A unit test
constructs the guard directly, so it stays green no matter how many places call it.

---

## `OptionalJwtAuthGuard` — a sixth guard, registered by the module that uses it

It is **not** in `CommonModule`, and the table above is still the complete list of what that module
provides. `OptionalJwtAuthGuard` answers "who is this caller _if_ they presented a credential?", and
the module whose route needs it provides it: `StoriesModule` registers it today, for the two public
story detail routes. Promoting it into `CommonModule` would make it available to every module for a
capability only one route has, which is the same "looks available, is not" shape the other five were
audited for.

### What it is for

`JwtAuthGuard` is applied per route by `@Secured()`, not bound as an `APP_GUARD`, and it returns
before reading any credential on a `@Public()` route — correctly, since a public route must not be
refused for lacking a token. The consequence is that `request.user` is never populated there, so a
public route cannot tell an anonymous caller from the author of the story in front of it. This guard
supplies exactly that distinction and nothing more:

| Credential                      | Result                                          |
| ------------------------------- | ----------------------------------------------- |
| absent                          | allowed, `request.user` left unset              |
| present and verifies            | allowed, `request.user` = verified `JwtPayload` |
| present and does **not** verify | **allowed, `request.user` left unset** — treated as anonymous, never honoured as an identity |

⛔ **Corrected.** This table previously said the third case is a **`401`** and the handler never
runs, with three paragraphs arguing that a 401 is the important row and must not be "simplified"
into an anonymous fallback. **The implementation does the opposite, deliberately.** Read
`optional-jwt-auth.guard.ts`: `verifyAccessToken` is wrapped in a `try/catch` that sets
`request.user = undefined` and `return true`.

The reasoning is recorded in the guard's own class comment and it is sound. The security property
that matters is *"an unverifiable claim is never trusted as an identity"* — falling back to the
anonymous branch preserves that exactly, because `request.user` stays unset and the handler applies
its rule to an anonymous caller. Nothing is granted. What a 401 adds is a refusal, not safety, and
this client authenticates **by cookie, not header**: `api.ts` sends `credentials: "include"` and
never sets `Authorization`, and `access_token` lives 15 minutes. So every reader who browses past
that boundary holds a stale cookie, and a 401 on a `@Public()` route reaches `handleResponse`,
which clears the stored user and signs them out — while trying to read a *published* story. An
expired session would deny anonymous access to public content.

The cost, stated plainly: an author whose token has expired gets 404 on their own draft rather than
a 401 telling them to refresh. `JwtAuthGuard` still returns 401 for the same token on every
*protected* route, so genuine authentication failure is still reported loudly where authentication
is actually required.

### It grants nothing

Optional auth is not optional _authorization_. Every use has to hand the identity to the layer that
owns the rule — for the story detail routes that is `StoriesService`, where
`assertStoryIsReadableBy` decides and answers 404 for a viewer that is neither the author nor a
content moderator. The guard's whole job is making "anonymous" and "identified" distinguishable
without ever granting access.

---

## `RestrictionGuard` — the second dead guard, and the bug that would have shipped with it

`RestrictionGuard` was in neither `CommonModule.providers` nor its exports, was applied to
zero routes, and had a passing unit suite. Six documents described it as a live control.
`moderation.event-handler.ts` wrote `restriction:<userId>` into Valkey and **nothing ever read
it**, so a moderation `ban` had no effect on the API at all.

### The bug that wiring it would have introduced

Read naively, the guard's own logic denied on the mere presence of the key. But the
producer wrote the **raw** action for all five of `'warn' | 'mute' | 'ban' | 'content_removal'
| 'no_action'`. So `restriction:<id>` held `'warn'` for a *warned* account — and wiring the
guard as written would have turned every warning, every content removal and every no-op
decision into a **total account lockout**.

The guard's tautology hid this: `restrictionTypeStr === 'ban' ? 403 : 403`. Both branches were
403, so there was no read/write distinction to notice the absence of.

### What changed

- **`moderation.event-handler.ts`** writes the cache key for `ban` and `mute` only, and stores
  the normalised value — the same vocabulary `user_restrictions` has always used. The audit row
  is still written for every action, so the moderation timeline keeps non-restricting decisions.
- **`restriction.guard.ts`** checks the **value**, not the key's existence, so a key written by
  an older build cannot deny by itself. `ban` → 403; `mute` → 423 on writes and reads pass; any
  other value → allowed.
- **`secured.decorator.ts`** composes it second in `SECURED_GUARDS`, after `JwtAuthGuard` (which
  populates `request.user`) and before `RolesGuard`.

### Why it fails open on a Valkey error

`ValkeyService.exists` already returns false when its client is null. The `try/catch` is for a
driver-level failure on a live connection, which would otherwise become a 500 on **every
authenticated request** — this guard is on every `@Secured` route. The trade is explicit: a cache
outage means the restriction is temporarily unenforced, which is the posture the WAF IP blocklist
already takes, and better than taking the API down. A banned account is still stopped at login
by `users.accessBlocked`, so the ban is not simply lifted.

### `@Public()` routes are not covered

`@Public()` returns from `JwtAuthGuard` and therefore from the whole composed chain, so a banned
account can still read public content. That is intended — a ban stops account access, it does not
make the public site disappear — but it means the control is **"every authenticated request"**,
not "every request". `consistency-matrix.md` is worded accordingly.

---

## `OwnershipGuard` — now real, and fail-closed

It was a class with a private factory (`createOwnershipGuard`) that appeared in no module
and in no `@UseGuards`. It contributed zero IDOR protection and looked like it contributed
some. That is the worst combination: false assurance.

### Wiring

`OwnershipGuard` cannot answer "is this caller the owner?" on its own — the owner of a
story, a comment, a rental and a contest lives in a different table per resource. So the
lookup is injected:

```ts
{ provide: OWNERSHIP_RESOLVER, useExisting: SomeResourceService }
```

in the owning module, then `@UseGuards(OwnershipGuard)` on the route. There is deliberately
**no default resolver**: there is no honest generic owner lookup, and a default returning
`null` for every request would make a route _look_ protected while denying all traffic.

### Fail-closed, in four places

| Situation                                   | Result                                |
| ------------------------------------------- | ------------------------------------- |
| No verified subject on the request          | 403 `Access denied`                   |
| No resolver registered                      | 403 `Ownership could not be verified` |
| Resolver throws                             | 403 `Ownership could not be verified` |
| Resolver returns a different id (or `null`) | 403 `You do not own this resource`    |

The middle two are the ones that mattered. A guard that returns `true` when it cannot
determine ownership is indistinguishable from having no guard at all.

The guard stays out of the way when it should: a public route, or a route whose
`@RequirePermissions(...)` list contains no `:own`-scoped permission, is allowed through
without a lookup. A super admin bypasses ownership unless `allowSuperAdmin: false`.

### Where it is wired

Each resource that owns an author column supplies its own resolver in its own module. The token is
single-valued, so the binding is module-scoped — which is the point: the resource that owns the table
owns the decision.

| Route                       | Resolver                   | Answers "who owns" from        |
| --------------------------- | -------------------------- | ------------------------------ |
| `PATCH /comments/:id`       | `CommentOwnershipResolver` | `COMMENTS_REPOSITORY.findById` |
| `DELETE /comments/:id`      | `CommentOwnershipResolver` | `COMMENTS_REPOSITORY.findById` |
| `PATCH /stories/:id`        | `StoryOwnershipResolver`   | `STORIES_REPOSITORY.findById`  |
| `POST /stories/:id/publish` | `StoryOwnershipResolver`   | `STORIES_REPOSITORY.findById`  |
| `POST /stories/:id/archive` | `StoryOwnershipResolver`   | `STORIES_REPOSITORY.findById`  |
| `DELETE /stories/:id`       | `StoryOwnershipResolver`   | `STORIES_REPOSITORY.findById`  |

Both resolvers go through the module's own repository interface, never a controller-side query and
never another module's table (Principle #7). `StoryOwnershipResolver` reads the repository directly
rather than `StoriesService.findById`, because that service reads through `TaggedCacheService` and the
cache is fail-open by design — acceptable for a page render, wrong for the input that decides who may
delete a story.

Two consequences of doing this at the guard rather than inside the service:

- **`404` becomes `403` for a nonexistent or soft-deleted id.** The guard denies before the handler,
  so "not yours" and "not there" are the same answer. That is the intended answer to an existence
  probe.
- **The in-service checks stay.** `CommentsService.update/delete` and
  `StoriesService.update/publish/archive/delete` still compare the author. They are now the second
  line, not the only one, and they still own the states the guard cannot see (already published,
  already archived, slug conflict).

`POST /stories` is deliberately ungated: it addresses no existing resource, so there is nothing to
own.

### Where it is NOT wired, and why

⛔ **Corrected — books is no longer on this list.** This section previously said
`OwnershipGuard` is not applied to `PATCH /books/:id`, `POST /books/:id/publish`,
`POST /books/:id/archive`, `DELETE /books/:id` "because **the `books` table has no owner
column**", and that `BooksService.update/publish/archive/delete` compare `book.author !== userId`,
"so those four routes currently answer 403 for every caller including the real owner."

**Both halves were stale.** Migration **`0021_add_books_owner_id.sql`** added
`books.owner_id uuid REFERENCES users(id)` (index `books_owner_id_idx`;
`backend/src/db/schema/books.schema.ts:49`), and `BooksService` now enforces it through
`assertOwnership` (`books.service.ts:445`), called on update (`:173`), publish (`:196`), archive
(`:227`) and delete (`:385`). `book.author` is no longer compared to `userId` anywhere — the two
places that used to (`books.service.ts:246`, `:300`, in the self-purchase and self-rental guards)
now read the owner column, as the comments there record.

Two things about the current state, stated precisely rather than as a new gap:

- **Ownership for books is enforced in the service, not by `OwnershipGuard`.** Both routes carry
  `@UseGuards(JwtAuthGuard)` (`books.controller.ts:53,103`), so an unauthenticated caller gets 401
  before ownership is considered; ownership then returns 403 from the service. That is real
  enforcement. It is simply invisible to anything auditing `@UseGuards`, and books still has no
  ownership resolver of the kind `comment-ownership.resolver.ts` provides.
- **`owner_id` is nullable and deliberately not backfilled.** `0021` cannot derive it from a display
  name, so pre-existing books are `ownerId === null` and `assertOwnership` throws a *distinct*
  message for that case ("This book has no owner. It was created before ownership was recorded, so
  an administrator must claim it…") rather than the generic "You can only update your own books".
  The migration ships the claim query as a comment; running it is an operator decision.

Also unwired, for the same reason as ever — no owner column, or no single-row resolver — and left
alone rather than guessed at: rentals, contests, badges and the library. Each needs its own
investigation of whether its table has an owner column and whether its repository can resolve one in
a single row lookup.

---

## The gap `OwnershipGuard` does NOT close — reported, not silently changed

`PermissionsGuard` grants an `:own`-scoped permission to any account whose type includes
it. From `common/permissions/permissions.ts`, a `READER` holds `COMMENTS_EDIT_OWN` and
`PROFILE_EDIT_OWN`; a `WRITER` holds `STORIES_EDIT_OWN`, `STORIES_DELETE_OWN`,
`BOOKS_SELL_OWN`, `CONTESTS_MANAGE_OWN` and more. Holding `comments:edit:own` says the
account _may_ edit its own comments — it is not, on its own, evidence that the comment in
front of this request is the caller's. Only `OwnershipGuard` makes that comparison.

Making `PermissionsGuard` enforce ownership would change the authorization behaviour of
every route that uses `@Secured(...)` with an `:own` permission, which is not this change's
call, and the fix belongs in `common/permissions/**` (not owned by this stream). Reported
upstream with the exact shape of the gap.

Two facts keep this precise rather than alarming:

- **No route declares an `:own` permission today.** Every `RequirePermissions` / `RequireAllPermissions`
  call site names one of `actions:create`, `reports:create`, `reports:view`,
  `reports:update:all`, `actions:view`, `stats:view`, `users:manage:all`. So the `:own` entries in the
  permission table are reachable only through a route nobody has written yet.
- **The routes that do edit owned content are now gated at the guard**, which is the layer that answers
  the question `PermissionsGuard` cannot. See the table above.

The exposure that remains is therefore the _naming_: the first route someone writes as
`@RequireAllPermissions(COMMENTS_EDIT_OWN)` will pass any reader through `PermissionsGuard` and rely on
`OwnershipGuard` being remembered as a second line. That is why `OwnershipGuard` refuses to skip a route
whose requirement contains any `:own`-scoped permission, and why it also runs on a route that declares no
permission at all.

---

## `RequirePermissions` mode — ALL by default, ANY by name

`hasPermission` used to be `required.some(...)`, i.e. **OR**, for every multi-permission requirement.
No call site passed a second permission, so nothing failed and the bug was latent: the next
`@RequirePermissions(USERS_MANAGE_ALL, FINANCIAL_MANAGE_ALL)` would have granted the route to a user
administrator alone, or to a financial officer alone, with no test to catch it.

Both meanings are legitimate, so neither was deleted. The caller names one:

| Decorator                     | Semantics | Use it when                                                                                                          |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| `RequireAllPermissions(A, B)` | **AND**   | the permissions are cumulative — "may manage users _and_ money"                                                      |
| `RequireAnyPermission(A, B)`  | **OR**    | the permissions are alternatives — "author, _or_ moderator"                                                          |
| `RequirePermissions(A)`       | **AND**   | retained shorthand; every existing call site passes one permission, for which the two modes are the same computation |

`ALL` is the default because the two directions of failure are not symmetric: a wrong `AND` denies a
legitimate caller, a wrong `ANY` grants an illegitimate one. The requirement carries its mode as data
(`{ permissions, mode }`, `common/types/permission-requirement.types.ts`), it travels with the list, and
both guards read it through the single normaliser `normalizePermissionRequirement`. A stale
pre-mode bare array is read as `ALL`, so the old OR behaviour cannot survive as a legacy path; anything
that is not a well-formed requirement throws rather than being treated as "no requirement".

The denial message reports the mode that was applied — `... and ...` or `... or ...` — because a
message that misreports the rule it enforced sends the reader to the wrong place.
