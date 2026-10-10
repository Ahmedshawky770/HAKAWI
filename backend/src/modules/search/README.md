# Search Module

## Overview
Provides full-text search capabilities for stories, authors, and categories.

## Endpoints
- `GET /search` - Search stories with filters
- `GET /search/authors` - Search authors by name
- `GET /search/categories` - Search categories by name

## Features
- Full-text search across story titles and excerpts
- `sortBy=relevance` ranks with `ts_rank_cd` over the exact `to_tsvector('simple', …)` expression
  `migrations/0014` indexed, with a `created_at` tiebreaker for stable paging; without a search term
  it degrades to recency, because a browse-by-filter call has no relevance signal
- `sortBy=date` is `published_at DESC NULLS LAST`, so never-published rows do not sort to the top
- Filter by category, tag, and author. `status` is accepted but **pinned to `published`** on the
  public route (`PUBLIC_STORY_STATUS`, shared with `GET /stories`) — a public search cannot be asked
  for drafts
- Search result highlighting with `<mark>` tags
- Author and category search endpoints
- Pagination support

## Caching Strategy
- Search results are cached in Valkey under the `search` namespace with a 5-minute TTL
- The cache key is built by `buildSearchCacheKey` in `cache-keys.ts` and includes every filter the
  repository can see — `query`, `category`, `tag`, `authorId`, `status`, **`sortBy`**, `page`, `limit`.
  `sortBy` was previously missing, so two different sorts of the same query shared one entry for its
  whole TTL
- Entries are indexed under `SEARCH_CACHE_TAG` and dropped by `StoriesService.invalidateStoryCache` on
  any story content write. A **view** does not sweep the tag: it invalidates only that story's own
  cached keys, so page views cannot empty the search index

## Repository Pattern
- `ISearchRepository` interface defines the contract
- `SearchRepository` implements data access with Drizzle ORM
- Dependency injection via `SEARCH_REPOSITORY` token

## Events
- No domain events emitted
