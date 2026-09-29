# Comments Module

## Overview
Manages story comments with nested reply support.

## Endpoints
- `GET /comments/story/:storyId` - Get comments for a story
- `GET /comments/:id/replies` - Get replies to a comment
- `POST /comments` - Create comment (authenticated)
- `PATCH /comments/:id` - Update comment (authenticated)
- `DELETE /comments/:id` - Delete comment (authenticated)

## Features
- Comment CRUD operations
- Nested replies with parent-child relationships
- Reply count tracking
- Author-only edit and delete permissions
- Soft delete support

## Repository Pattern
- `ICommentsRepository` interface defines the contract
- `CommentsRepository` implements data access with Drizzle ORM
- Dependency injection via `COMMENTS_REPOSITORY` token

## Events
- `comment.created` - Emitted when a comment is created
- `comment.updated` - Emitted when a comment is updated
- `comment.deleted` - Emitted when a comment is deleted
