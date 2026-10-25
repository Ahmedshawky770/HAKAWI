-- Migration 0039: Partition cutover — switch reads to the partitioned tables and drop legacy tables.
--
-- WHY. Migration 0035 created `messages_p`, `notifications_p`, `payment_transactions_p`,
-- `reactions_p` as partitioned parents alongside the legacy tables. Dual-write (implemented in
-- the repositories) keeps both in sync. This migration completes the cutover:
--
--   1. Verifies row counts match between legacy and partitioned tables (fails fast if not).
--   2. Drops the legacy tables (`messages`, `notifications`, `payment_transactions`,
--      `reactions`) — the partitioned parents are now the sole source of truth.
--   3. Drops the legacy indexes/constraints that belonged to the legacy tables.
--
-- PRINCIPLES:
--   #6 Minimize Migrations — this is a one-time cutover; no schema changes to existing columns.
--   #9 SSOT — after cutover, `*_p` parents are the Single Source of Truth for these tables.
--
-- ⚠️ IRREVERSIBLE: Dropping the legacy tables destroys them. There is no down script that can
-- restore the data. Back up the database before running this migration.
--
-- PRECONDITION (must be verified before running):
--   1. Migration 0035 has been applied (partitioned tables exist).
--   2. Dual-write is active in all writers (MessagesRepository, NotificationsRepository,
--      ReactionsRepository, PaymentsRepository.createTransaction).
--   3. `npm run db:backfill-partitions` has been run and all row counts match.
--   4. `npm run db:verify-cutover` has passed.
--   5. Application code has been updated to read from `*_p` (with fallback to legacy tables).
--
-- ROLLBACK: Not supported after legacy tables are dropped. Restore from backup if needed.

-- 1. Verify row counts match (fails fast if any table is out of sync)
DO $$
DECLARE
  v_source_cnt bigint;
  v_target_cnt bigint;
BEGIN
  -- messages
  SELECT count(*) INTO v_source_cnt FROM "messages";
  SELECT count(*) INTO v_target_cnt FROM "messages_p";
  IF v_source_cnt <> v_target_cnt THEN
    RAISE EXCEPTION 'messages (%) != messages_p (%): run db:backfill-partitions first', v_source_cnt, v_target_cnt;
  END IF;

  -- notifications
  SELECT count(*) INTO v_source_cnt FROM "notifications";
  SELECT count(*) INTO v_target_cnt FROM "notifications_p";
  IF v_source_cnt <> v_target_cnt THEN
    RAISE EXCEPTION 'notifications (%) != notifications_p (%): run db:backfill-partitions first', v_source_cnt, v_target_cnt;
  END IF;

  -- payment_transactions
  SELECT count(*) INTO v_source_cnt FROM "payment_transactions";
  SELECT count(*) INTO v_target_cnt FROM "payment_transactions_p";
  IF v_source_cnt <> v_target_cnt THEN
    RAISE EXCEPTION 'payment_transactions (%) != payment_transactions_p (%): run db:backfill-partitions first', v_source_cnt, v_target_cnt;
  END IF;

  -- reactions
  SELECT count(*) INTO v_source_cnt FROM "reactions";
  SELECT count(*) INTO v_target_cnt FROM "reactions_p";
  IF v_source_cnt <> v_target_cnt THEN
    RAISE EXCEPTION 'reactions (%) != reactions_p (%): run db:backfill-partitions first', v_source_cnt, v_target_cnt;
  END IF;

  RAISE NOTICE 'All row counts match between legacy and partitioned tables.';
END $$;

--> statement-breakpoint

-- 2. Drop legacy tables (data-loss classification: the data lives on in *_p)
-- IF EXISTS makes the migration idempotent if run partially, but data is unrecoverable.
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TABLE IF EXISTS "payment_transactions" CASCADE;
DROP TABLE IF EXISTS "reactions" CASCADE;

-- ============================================================
-- Down script: 0039_partition_cutover.down.sql
-- Reversibility: data-loss — dropping legacy tables cannot be reversed. This down script
-- exists only for documentation; it does NOT recreate the legacy tables.
-- Restore from backup if rollback is required.
-- ============================================================
