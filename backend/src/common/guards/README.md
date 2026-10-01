# `common/guards` — who is allowed to do what

Five guards, one rule: **a guard that cannot establish the caller's right to the resource
must deny.** Everything below follows from that.

| Guard              | Question it answers                            | Wired                             |
| ------------------ | ---------------------------------------------- | --------------------------------- |
| `JwtAuthGuard`     | Is there a verified token, and who is it?      | `@UseGuards`, per route           |
| `RolesGuard`       | Is the account type / admin role sufficient?   | `@Secured`, per route             |
| `PermissionsGuard` | Is the granted permission set sufficient?      | `@Secured` (via `SECURED_GUARDS`) |
| `OwnershipGuard`   | Is the caller the owner of _this_ resource?    | applied per route — see below     |
| `RestrictionGuard` | Is the account restricted (ban / restriction)? | applied per route                 |

All five are provided **and exported** by `CommonModule`, so `@UseGuards(SomeGuard)`
resolves from any module. `common.module.spec.ts` pins that list; it is the exact property
whose absence made `OwnershipGuard` dead code.

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

`OwnershipGuard` is not applied to the books write routes — `PATCH /books/:id`,
`POST /books/:id/publish`, `POST /books/:id/archive`, `DELETE /books/:id` — because **the `books`
table has no owner column**. `books.author` is a `varchar(255)` display name, written from the
caller's input and indexed for search, not a reference to `users.id`.

A resolver here would have to compare that name against a UUID. Two honest options, and both are
refactors rather than a wiring change:

1. **Add `books.owner_id uuid references users(id)`** plus a backfill, and decide which of the two
   meanings of "author" survives — the book's _display_ author or the account that _owns_ the
   listing. They are different facts and the schema currently has room for only one. This is a
   migration (Principle #6) and a change to `CreateBookInput`/`UpdateBookInput`, the DTOs, the
   `books` e2e contract and `BooksService`.
2. **Stop pretending.** Resolve `author` through the users module by display name. That is a
   cross-module query (Principle #7) and it makes a mutable free-text field an authorization key.

Neither was done here, and nothing was half-wired: a resolver that compares a name to a UUID would
deny every legitimate author and grant access to whoever typed a matching string.

Worth knowing while that decision is open: `BooksService.update/publish/archive/delete` compare
`book.author !== userId` today, so those four routes currently answer 403 for every caller including
the real owner. That fails **closed** — it is a functional bug, not an IDOR — and it is the reason
the gap above is a usability problem rather than an exposure. It will become an exposure the moment
anyone "fixes" it by populating `books.author` with the caller's id and pointing the guard at that
column. Fix the ownership column first.

Also unwired, for the same reason, and left alone rather than guessed at: rentals, contests, badges
and the library. Each needs its own investigation of whether its table has an owner column and
whether its repository can resolve one in a single row lookup; none of them was changed here.

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
