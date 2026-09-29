# Tags Module

## Overview
Manages tags for flexible story classification and discovery.

## Endpoints
- `GET /tags` - List all tags
- `GET /tags/:id` - Get tag by ID
- `GET /tags/slug/:slug` - Get tag by slug
- `POST /tags` - Create tag (authenticated)
- `PATCH /tags/:id` - Update tag (authenticated)

## Features
- Tag CRUD operations
- Slug-based lookup for SEO-friendly URLs
- Duplicate slug prevention

## Repository Pattern
- `ITagsRepository` interface defines the contract
- `TagsRepository` implements data access with Drizzle ORM
- Dependency injection via `TAGS_REPOSITORY` token

## Events
- No domain events emitted
