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
| GET    | /stories             | List all stories (with pagination/filters)         |
| GET    | /stories/:id         | Get story by ID                                    |
| GET    | /stories/slug/:slug  | Get story by slug                                  |
| POST   | /stories             | Create new story (auth required)                   |
| PATCH  | /stories/:id         | Update story (auth required, **author only**)      |
| POST   | /stories/:id/publish | Publish story (auth required, **author only**)     |
| POST   | /stories/:id/archive | Archive story (auth required, **author only**)     |
| DELETE | /stories/:id         | Soft delete story (auth required, **author only**) |

### Author-only write routes

The four routes that address an existing story carry `OwnershipGuard`, bound to
`StoryOwnershipResolver` via `OWNERSHIP_RESOLVER` in `StoriesModule`. The guard resolves
`stories.authorId` through `STORIES_REPOSITORY.findById` before the handler runs, so a non-author
never reaches `StoriesService`.

`StoryOwnershipResolver` reads the repository directly rather than `StoriesService.findById`, because
that service reads through `TaggedCacheService` and the cache is fail-open by design — the right
trade for a page render, the wrong one for the input that decides who may delete a story.

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

- Unit tests: `stories.service.spec.ts`
- Event handler tests: `events/stories.event-handler.spec.ts`
- Integration tests: To be added

## Dependencies

- `CategoriesModule` - For category management
- `TagsModule` - For tag management
- `CommonModule` - For shared services (logger, valkey, event emitter)
