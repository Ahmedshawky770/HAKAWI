# Reactions Module

## Overview
Manages story reactions with support for multiple reaction types.

## Endpoints
- `POST /reactions/stories/:storyId` - Add reaction to story (authenticated)
- `DELETE /reactions/stories/:storyId` - Remove reaction from story (authenticated)
- `GET /reactions/stories/:storyId` - Get reactions for a story
- `GET /reactions/stories/:storyId/counts` - Get reaction counts by type
- `GET /reactions/stories/:storyId/me` - Get current user's reaction (authenticated)

## Features
- 6 reaction types supported
- Users can change their reaction type
- Reaction counts aggregated by type
- Paginated reaction lists

## Repository Pattern
- `IReactionsRepository` interface defines the contract
- `ReactionsRepository` implements data access with Drizzle ORM
- Dependency injection via `REACTIONS_REPOSITORY` token

## Events
- `story.reacted` - Emitted when a user adds a reaction to a story
- `story.reaction.removed` - Emitted when a user removes a reaction from a story
