# ADR-011: Separate Counters Table (Single Source of Truth)

## Status
Accepted

## Context
`stories.view_count/like_count/comment_count`, `books.view_count/like_count/
download_count` and `comments.like_count/reply_count` are denormalized counters
stored inside the main entity tables. Every interaction requires an UPDATE on the
parent row (write amplification + race-condition hazard). Migration 0019
(`backfill_denormalised_counters.sql`) already documents that these counters drift
from reality and need periodic repair.

## Decision
1. New `counters` table (`migrations/0036_create_counters_table.sql`) is the Single
   Source of Truth for every counter: `(entity_type, entity_id, counter_name)` unique
   constraint → one row per counter.
2. Existing counter values are backfilled from the main tables into `counters`.
3. The counter columns on `stories`, `books` and `comments` remain as read-only
   caches, refreshed from `counters` by a backfill job. Exact-consistency reads go
   to `counters` via `withPrimary()`.
4. A follow-up migration can drop the cache columns once all writers have migrated
   to `counters`.

## Consequences
- Counter increments no longer touch the main entity rows (reduced write
  amplification).
- One authoritative source for counters (Principle #9).
- Read scaling: counter reads can be served from replicas unless strong consistency
  is required.

## References
- Principle #9 SSOT — `counters` is the authoritative source.
- Principle #6 Minimize Migrations — additive migration with data backfill.
- `migrations/0036_create_counters_table.sql`
