# ADR-010: Declarative Partitioning for High-Growth Tables

## Status
Accepted

## Context
`messages`, `notifications`, `payment_transactions` and `reactions` grow without
bound. A single monolithic table makes every index larger, every VACUUM slower, and
every backup/restore more expensive. These are append-only, time-series workloads
ideal for Declarative Partitioning by `created_at`.

## Decision
1. New partitioned parent tables `messages_p`, `notifications_p`,
   `payment_transactions_p`, `reactions_p` are created by
   `migrations/0035_create_partitioned_tables.sql`, partitioned by RANGE on
   `created_at` (monthly child partitions, Jan 2026 – Dec 2026).
2. Legacy tables remain in place (additive migration, no columns dropped or renamed)
   so rollback is simply dropping the new partitioned tables.
3. Archiving functions `archive_*_before(ts)` detach old partitions into standalone
   `*_archived_*` tables, which can be moved to cold storage (S3) or dropped after
   retention.
4. Indexes and FKs mirror the legacy tables; PostgreSQL propagates parent indexes to
   every child partition.

## Consequences
- Each partition is small enough to vacuum, reindex, and archive independently.
- Time-range queries (e.g. "notifications this month") benefit from partition
  pruning.
- Follow-up work: swap legacy tables for partitioned ones after dual-write
  backfill is verified (Principle #6: additive first, cutover later).

## References
- Principle #6 Minimize Migrations — additive migration with reversible down script.
- `migrations/0035_create_partitioned_tables.sql`
