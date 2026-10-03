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
