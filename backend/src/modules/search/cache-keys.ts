/**
 * The cache coordinates for the search index, in their own module rather than inside
 * `search.service.ts`.
 *
 * WHY THEY ARE NOT LOCAL CONSTANTS. The invalidation half of this contract has to be called from
 * `StoriesService`, which is a different module, and the tag string has to be the SAME string in
 * both places — a typo would produce a silent, permanent cache-staleness bug that no type checker
 * and no test would catch, because both halves would still typecheck against their own copy. One
 * shared constant is the only thing that makes the two halves the same value.
 *
 * WHY THE CACHE WAS UNTAGGED BEFORE. `SearchService` wrote to Valkey directly with
 * `valkeyService.set(\`search:${...}\`, ..., 300)`. A raw key is not indexed under any tag, so
 * `invalidateTags` could not reach it and `StoriesService` had nothing to call. The consequences
 * were concrete: a story published at T was invisible to search for up to 300 seconds, and a story
 * unpublished at T stayed findable for up to 300 seconds — including after the public route was
 * pinned to `status = 'published'`, which made the staleness a disclosure rather than just a lag.
 */
export const SEARCH_CACHE_NAMESPACE = 'search';

/** Every cached search page is indexed under this tag; `StoriesService` bumps it on any write. */
export const SEARCH_CACHE_TAG = 'search';

export const SEARCH_CACHE_TTL_SECONDS = 300;

/**
 * The sort a search resolves to when the caller names none.
 *
 * WHY A CONSTANT AND NOT A SECOND `|| 'relevance'`. This used to be spelled inline in
 * `SearchService.search`, which meant the value the repository sorted by and the value that would
 * have to go into a cache key were two separate expressions that happened to agree. Any default has
 * to be resolvable BEFORE the cache key is built and then used for both, or "omitted" and "explicit"
 * become two cache entries for one result set — a silent doubling of the index, not a visible bug.
 */
export const SEARCH_DEFAULT_SORT = 'relevance';

/**
 * The cache key for one search page.
 *
 * WHY EVERY FILTER IS IN HERE, INCLUDING `sortBy`. The key is the whole correctness boundary of a
 * TTL cache: any input the repository can see and any input that changes the repository's output has
 * to be part of it, and the value the key omits is the value a later caller will be served the wrong
 * answer for. `sortBy` was missing, so `?query=x&sortBy=views` and `?query=x&sortBy=date` collided on
 * one entry for its full 300 seconds and whichever landed first was served to both — a caller asking
 * for the most-read stories was shown the most-recently-published ones, or vice versa, for five
 * minutes, with nothing in the response to say so.
 *
 * WHY THE FUNCTION LIVES HERE AND NOT IN `search.service.ts`. This module is already the owner of
 * the search cache contract (see the note above), and the key builder is half of that contract. As a
 * private method it could only be asserted through a `TaggedCacheService` mock, which is how the
 * omission survived every existing test: the key was never a value anything could inspect.
 *
 * `sortBy` is resolved by the caller before it gets here — `search()` applies
 * `SEARCH_DEFAULT_SORT` once and passes the resolved field down — so an omitted sort and an explicit
 * `?sortBy=relevance` share one entry instead of two, which is what they are.
 *
 * WHY `query` IS ENCODED AND THE OTHER PARTS ARE NOT. It is the only part that can contain a
 * separator, and a raw `:` in it would let a crafted query forge another entry's suffix.
 */
export function buildSearchCacheKey(filters: {
  query?: string;
  category?: string;
  tag?: string;
  authorId?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy: string;
}): string {
  const parts = ['search'];
  if (filters.query) parts.push(`q:${encodeURIComponent(filters.query)}`);
  if (filters.category) parts.push(`cat:${filters.category}`);
  if (filters.tag) parts.push(`tag:${filters.tag}`);
  if (filters.authorId) parts.push(`author:${filters.authorId}`);
  if (filters.status) parts.push(`status:${filters.status}`);
  parts.push(`sort:${filters.sortBy}`);
  parts.push(`page:${filters.page ?? 1}`);
  parts.push(`limit:${filters.limit ?? 20}`);
  return parts.join(':');
}
