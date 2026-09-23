# Users Module

## Overview
Manages user profiles, account settings, and OAuth provider associations.

## Endpoints
- `GET /api/v1/users/:id` - Get user profile by ID
- `PATCH /api/v1/users/:id` - Update user profile

## Features
- Profile management (name, email, username, avatar, bio)
- OAuth provider linking (Google, Facebook, Twitter, GitHub, Apple, TikTok)
- User statistics
- Soft delete support
- Valkey caching with TTL (5 minutes)

## Caching Strategy
- User data is cached in Valkey with 5-minute TTL
- Cache is invalidated on user update or delete
- Password hash is never cached or returned in API responses

## Repository Pattern
- `IUsersRepository` interface defines the contract
- `UsersRepository` implements data access with Drizzle ORM
- Dependency injection via `USERS_REPOSITORY` token

## Events
- `user.registered` - Emitted when a new user is created
- `user.updated` - Emitted when a user profile is updated
