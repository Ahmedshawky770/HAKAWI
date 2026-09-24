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

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /stories | List all stories (with pagination/filters) |
| GET | /stories/:id | Get story by ID |
| GET | /stories/slug/:slug | Get story by slug |
| POST | /stories | Create new story (auth required) |
| PATCH | /stories/:id | Update story (auth required) |
| POST | /stories/:id/publish | Publish story (auth required) |
| POST | /stories/:id/archive | Archive story (auth required) |
| DELETE | /stories/:id | Soft delete story (auth required) |

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
