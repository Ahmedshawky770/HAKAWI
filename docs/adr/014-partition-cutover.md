# ADR-014: Partition Cutover for High-Growth Tables

## Status
Accepted (code implemented, DB execution pending)

## Context
Migration 0035 created partitioned parents `messages_p`, `notifications_p`,
`payment_transactions_p`, `reactions_p` alongside the legacy tables. Dual-write was implemented
in the repositories (MessagesRepository, NotificationsRepository, ReactionsRepository,
PaymentsRepository.createTransaction) to keep both in sync. A backfill script copies existing
data into the partitioned tables. The cutover completes the migration: reads switch to the
partitioned tables and the legacy tables are dropped.

## Implementation Status
**Code changes (complete, verified with typecheck + lint):**
- Repository read paths switched to `*_p` tables via `dbPrimary.execute()` / `$client.query()`:
  - `MessagesRepository`: findById, findByConversation, countUnread, findLastByConversations,
    countIncomingUnreadByConversations
  - `NotificationsRepository`: findById, findByUser, findUnread, countUnread
  - `ReactionsRepository`: findById, findByUserAndStory, findReactionsByStory, countReactions,
    countReactionsByType, countByType
- Dual-write remains active for all writes (legacy table + `*_p` parent).
- Scripts: `backfill-partitioned-tables.ts`, `verify-partition-cutover.ts`.
- Migration: `0039_partition_cutover.sql` (drops legacy tables).

**Pending DB execution (requires live PostgreSQL):**
1. `npm run db:backfill-partitions` — copies legacy data to `*_p` tables (idempotent).
2. `npm run db:verify-cutover` — verifies row-count parity before cutover — fails fast if out of sync.
3. Run `migrations/0039_partition_cutover.sql` — drops legacy tables after parity verified.
   Data-loss classification: the data lives on in `*_p`.
4. Deploy the updated repository code in sync with migration 0039.

These steps must be executed in order: backfill → verify → migration 0039 → deploy.

## Consequences
- Partition pruning benefits time-range queries (e.g. "notifications this month").
- Each partition is small enough to vacuum, reindex, and archive independently.
- Cutover is not reversible after legacy tables are dropped — back up first.
- Application code must be updated and deployed in sync with migration 0039.

## References
- Principle #6 Minimize Migrations — additive migration, then cutover.
- Principle #9 SSOT — `*_p` parents become the Single Source of Truth.
- `migrations/0039_partition_cutover.sql`
- `backend/scripts/backfill-partitioned-tables.ts`
- `backend/scripts/verify-partition-cutover.ts`
