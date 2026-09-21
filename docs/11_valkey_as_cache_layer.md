# Principle #11: Valkey (Docker) as Cache Layer

**Statement:**
I use Valkey (a Redis-compatible in-memory store) running in Docker as my caching layer. It is fast, lightweight, predictable, and easy to orchestrate. Caching is not an optimization I add later — it is part of the architecture from day one, with clear invalidation strategies, TTL policies, and fallback mechanisms. A cache without an invalidation strategy is a bug factory.

**Rationale:**
- Caching is critical for performance
- Valkey is Redis-compatible and lightweight
- Docker makes it easy to orchestrate
- Invalidation strategy prevents stale data

**Enforcement:**
- Valkey running in Docker Compose
- TTL policies for all cached data
- Tag-based invalidation
- Cache hit rate monitoring

**Strategies:**
- Cache-aside pattern
- Write-through for critical data
- TTL based on data volatility
- Cache warming for frequently accessed data
