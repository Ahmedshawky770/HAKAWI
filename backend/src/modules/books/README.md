# Books Module

## Overview

Manages book CRUD operations, publishing workflow, and download tracking.

## Endpoints

- `GET /books` - List all books
- `GET /books/:id` - Get book by ID
- `GET /books/isbn/:isbn` - Get book by ISBN
- `POST /books` - Create book (authenticated)
- `PATCH /books/:id` - Update book (authenticated)
- `POST /books/:id/publish` - Publish book (authenticated)
- `POST /books/:id/archive` - Archive book (authenticated)
- `POST /books/:id/download` - Increment download count and get URL (authenticated)
- `DELETE /books/:id` - Soft delete book (authenticated)

## Features

- Book CRUD with status workflow (draft, published, archived)
- ISBN uniqueness validation
- Cover image and PDF support
- View and download count tracking
- Search integration via search module
- Soft delete support

## Caching Strategy

- `GET /books/:id` and `GET /books/isbn/:isbn` both read through `TaggedCacheService`, 10-minute TTL,
  tagged `books`. The ISBN path used to bypass the cache entirely, which gave one row two independent
  staleness windows; both paths are now cached and both are dropped on every write.
- Cache keys: `cache:book:{id}` and `cache:book:isbn:{isbn}` (`bookIsbnCacheKey`).
- **Cached values are revived before use.** `JSON.parse` cannot restore a `Date`, so a cache hit
  returned ISO strings where `toBookResponse` expected `Date`s and `GET /books/:id` answered 500 on
  every warm key while the first cold read worked. `revive: reviveBookDates` makes the cached path
  shape-identical to the uncached one (`books/types.ts`, primitives in `shared/cache/date-revival.ts`).
- Invalidation is **targeted**: `invalidateBookCache(id, ...isbns)` deletes this book's id key and
  every ISBN key it has been cached under — including the previous one when the ISBN is renamed, and
  the new one when it is not. It no longer sweeps the whole `books` tag, which evicted every other
  book in the deployment on each view, download, update and publish.
- Covered by `invalidateBookCache`: `update`, `publish` (it used to invalidate nothing at all, so a
  published book kept serving `status: 'draft'` for ten minutes), `archive`, `delete`,
  `incrementViewCount`, `incrementDownloadCount`, and the view bump inside `purchase`/`rent`.
- `viewCount`/`downloadCount` live inside the cached payload, so a bump retires this book's keys:
  the counter is intentionally eventually consistent, and the invalidation is the freshness window.
- Regression proof: `books.service.cache.spec.ts` drives the real `TaggedCacheService` over an
  in-memory Valkey that stores **strings**, so a serialize → deserialize round trip is exercised for
  real. Removing `revive` makes it fail with `TypeError: book.publishDate?.toISOString is not a function`.

## Repository Pattern

- `IBooksRepository` interface defines the contract
- `BooksRepository` implements data access with Drizzle ORM
- Dependency injection via `BOOKS_REPOSITORY` token

## Events

- `book.created` - Emitted when a book is created
- `book.updated` - Emitted when a book is updated
- `book.published` - Emitted when a book is published
- `book.archived` - Emitted when a book is archived
- `book.deleted` - Emitted when a book is deleted
