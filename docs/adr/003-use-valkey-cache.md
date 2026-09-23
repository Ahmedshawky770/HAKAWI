# ADR-003: Use Valkey (Redis-compatible) for Caching

## Status
Accepted

## Context
We needed a caching layer for:
- Session storage
- Refresh token blacklist
- User profile caching
- Rate limiting storage

## Decision
We chose **Valkey** (Redis-compatible) because:
- It is Redis-compatible, allowing us to use existing Redis clients (ioredis)
- It is lightweight and easy to orchestrate with Docker
- It supports TTL-based expiration
- It is open-source and has a permissive license
- It can replace Redis in production if needed

## Consequences
- Valkey runs in Docker Compose for local development
- Cache invalidation is manual (delete on update/delete)
- No cache hit rate monitoring implemented yet
- TTL policies must be defined per data type
