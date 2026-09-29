# Search Module

## Overview
Provides full-text search capabilities for stories, authors, and categories.

## Endpoints
- `GET /search` - Search stories with filters
- `GET /search/authors` - Search authors by name
- `GET /search/categories` - Search categories by name

## Features
- Full-text search across story titles and content
- Filter by category, tag, author, and status
- Search result highlighting with `<mark>` tags
- Author and category search endpoints
- Pagination support

## Caching Strategy
- Search results are cached in Valkey with 5-minute TTL
- Cache key is built from all query parameters
- Cache is not explicitly invalidated (TTL-based expiry)

## Repository Pattern
- `ISearchRepository` interface defines the contract
- `SearchRepository` implements data access with Drizzle ORM
- Dependency injection via `SEARCH_REPOSITORY` token

## Events
- No domain events emitted
