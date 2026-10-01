# Shared cache

Everything that reads or writes Valkey as a **cache** goes through this folder. Two halves:

| File                                       | Role                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `tagged-cache.service.ts`                  | Service-level half. Cache-aside for anything not an HTTP controller handler.                   |
| `common/interceptors/cache.interceptor.ts` | HTTP half. `@Cacheable` / `@InvalidateCacheTags` / `@WarmCacheTags`.                           |
| `date-revival.ts`                          | Shared primitives that turn a JSON-decoded entry back into the object the repository returned. |
| `tag-index.ts`                             | Tag index maintenance: bounded growth, and no tombstones.                                      |
| `tag-generation.ts`                        | Write-ordering protocol so an invalidation cannot be undone by an in-flight write.             |
| `common/decorators/cache.decorator.ts`     | Key naming and key construction.                                                               |

## The three invariants

Every cache write in this codebase has to satisfy all three. They exist because each one was a
live bug, and each is regression-tested.

### 1. Shape parity — a hit returns what a miss returns

`JSON.stringify(new Date())` is an ISO string and `JSON.parse` cannot know it used to be a `Date`.
So a cache hit used to hand back a structurally different object from the same repository call, and
`book.createdAt.toISOString()` threw `TypeError` — **only on hits**, so the first request of every
cold key worked and every later one failed with a 500.

Any entity cached with `TaggedCacheService` therefore passes `revive`:

```ts
const { value } = await this.cache.getOrSet<Book>({
  namespace: BOOK_CACHE_NAMESPACE,
  key: id,
  ttl: BOOK_CACHE_TTL_SECONDS,
  tags: [BOOKS_CACHE_TAG],
  revive: reviveBookDates,
  load: async () => {
    /* repository row */
  },
});
```

The primitives are shared; **which fields are dates is entity knowledge**, so the field list lives
next to the entity type (`books/types.ts`). A revival that cannot rebuild the shape throws
`CacheEntryCorruptError`, which `get` treats like unparseable JSON: the entry is dropped, a miss is
recorded, and the repository reloads. A corrupt entry heals instead of failing the request.

### 2. Bounded index, no tombstones

A tag index set is only ever emptied by an invalidation, so a bare `SADD` grew it forever — the one
cached key with no TTL. Every index write now carries `TAG_INDEX_TTL_SECONDS` (24h, comfortably above
the longest entry TTL it tracks), and `invalidateKey` unindexes the key it deletes.

### 3. Deterministic ordering

`void (async () => {...})()` cannot be ordered against an invalidation that happens while the
response is being produced, so a write could land _after_ a concurrent update had already
invalidated the key and put the invalidated value back.

Every writer snapshots the generation of its tags (`cache:taggen:<tag>`) **before** it loads, and
re-reads it immediately before writing. A generation that moved means an invalidation landed while
the data was being read, so the write is discarded. The write stays off the response path — a cache
must not add latency to the request it accelerates — and the generation keys are deliberately
persistent, because a generation that expired would restart at 0 and reopen the very window the
protocol closes.

This is what makes a **targeted** invalidation as safe as a tag sweep, which is what lets
`stories.service.ts` drop one story's keys instead of every story's.

## Fail-open, everywhere

An unreachable Valkey degrades the cache, never the request: an unreadable entry is a miss, an
unreadable generation snapshot is `null` ("unknown" → permit the write), a failed write is logged.
The cache is protection; a cache outage must not become an outage (Principle #12).

## Cache keys fail safe

`cache:<namespace>:<route>:u:<userId|anon>[:p:<keyParams>][:q:<canonical query>]`

The default key folds in every dimension that can change a response. `keyParams` defaults to `[]`,
and the key used to ignore the user and the query entirely — so the first
`@Cacheable({ namespace: 'feed' })` on an authenticated or paginated route collapsed onto
`cache:feed:default` and served one user's response to another. Nothing failed loudly. A misconfigured
decorator now still separates users, query strings and routes; two requests share a key only when
they genuinely asked for the same thing.

## Testing a cache

Never assert that a method was called; assert what the cache _holds_. A `vi.fn()` double that
returns the object it was given cannot see a serialisation bug, cannot see a tag sweep evicting an
unrelated entry, and — as the old stories spec proved — will happily pass while asserting the very
call that was destroying the cache. The specs here store strings, index tags, and count round trips.
