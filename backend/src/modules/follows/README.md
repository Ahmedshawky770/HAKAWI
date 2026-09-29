# Follows Module

## Overview
Manages user follow/unfollow relationships and social graph.

## Endpoints
- `POST /follows` - Follow a user (authenticated)
- `DELETE /follows/:followingId` - Unfollow a user (authenticated)
- `GET /follows/user/:userId/followers` - Get user followers
- `GET /follows/user/:userId/following` - Get users a user is following
- `GET /follows/user/:userId/stats` - Get follow statistics
- `GET /follows/check/:followingId` - Check if following a user (authenticated)

## Features
- Follow/unfollow functionality
- Follower and following lists with pagination
- Follow statistics (counts and current user status)
- Self-follow prevention
- Duplicate follow prevention

## Repository Pattern
- `IFollowsRepository` interface defines the contract
- `FollowsRepository` implements data access with Drizzle ORM
- Dependency injection via `FOLLOWS_REPOSITORY` token

## Events
- `user.followed` - Emitted when a user follows another user
- `user.unfollowed` - Emitted when a user unfollows another user
