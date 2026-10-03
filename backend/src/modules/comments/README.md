# Comments Module

## Overview

Manages story comments with nested reply support.

## Endpoints

- `GET /comments/story/:storyId` - Get comments for a story
- `GET /comments/:id/replies` - Get replies to a comment
- `POST /comments` - Create comment (authenticated)
- `PATCH /comments/:id` - Update comment (authenticated, **author only**)
- `DELETE /comments/:id` - Delete comment (authenticated, **author only**)

The author-only rule on the two write routes is enforced by `OwnershipGuard`, which resolves the
comment's `authorId` through `CommentOwnershipResolver` (`OWNERSHIP_RESOLVER`, bound in this module)
before the handler runs. `CommentsService.update`/`delete` still compare the author as a second line
and still own the 404s. A non-author, an unknown id and a soft-deleted id all answer 403
`You do not own this resource` from the guard, which means the route does not confirm whether a given
comment id exists. See `src/common/guards/README.md`.

## Features

- Comment CRUD operations
- Nested replies with parent-child relationships
- Reply count tracking
- Author-only edit and delete, enforced at the guard and in the service
- Soft delete support

## Repository Pattern

- `ICommentsRepository` interface defines the contract
- `CommentsRepository` implements data access with Drizzle ORM
- Dependency injection via `COMMENTS_REPOSITORY` token
- `findById` doubles as the ownership lookup, so no separate `findOwnershipTarget` was needed

## Events

- `comment.created` - Emitted when a comment is created
- `comment.updated` - Emitted when a comment is updated
- `comment.deleted` - Emitted when a comment is deleted
