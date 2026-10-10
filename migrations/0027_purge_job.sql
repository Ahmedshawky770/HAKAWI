-- Automated purge job for soft-deleted records.
--
-- WHY. The schema uses soft deletes (`deleted_at` timestamp) on 7 tables:
--   users, stories, comments, uploads, books, payments, rentals
-- but NO purge job exists. Soft-deleted rows accumulate forever, wasting space
-- and potentially leaking in queries that forget the `deleted_at IS NULL` filter.
--
-- WHY NOT CASCADE DELETES. The data architecture documents cascade deletes as a
-- goal, but they are dangerous in production: a single `DELETE FROM users`
-- would cascade to stories, comments, rentals, payments, etc. — millions of
-- rows in one transaction, locking tables for minutes. A purge job is safer:
-- it runs in small batches, during low-traffic windows, with monitoring.
--
-- WHAT THIS MIGRATION DOES:
--   1. Creates a `purge_job` table to track purge runs
--   2. Creates a stored procedure `purge_soft_deleted()` that:
--      - Processes tables in dependency order (children first)
--      - Deletes in batches of 1000 rows per table per run
--      - Only deletes rows where `deleted_at < NOW() - INTERVAL '30 days'`
--      - Returns stats for monitoring
--   3. Documents the cron schedule (not created by migration — operator configures)

-- Table to track purge job runs
CREATE TABLE "purge_job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "tables_processed" jsonb NOT NULL DEFAULT '{}',
  "rows_deleted" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'running',
  "error" text
);

--> statement-breakpoint

CREATE INDEX "purge_job_runs_started_at_idx" ON "purge_job_runs" ("started_at");

--> statement-breakpoint

-- Purge procedure: deletes soft-deleted rows older than 30 days in batches
CREATE OR REPLACE FUNCTION purge_soft_deleted(
  p_batch_size integer DEFAULT 1000,
  p_retention_days integer DEFAULT 30,
  p_dry_run boolean DEFAULT false
) RETURNS TABLE (
  table_name text,
  rows_deleted bigint
) LANGUAGE plpgsql AS $$
DECLARE
  v_cutoff timestamptz := now() - (p_retention_days || ' days')::interval;
  v_table text;
  v_deleted bigint;
  v_sql text;
BEGIN
  -- Order matters: children before parents (FK dependencies)
  FOR v_table IN SELECT unnest(ARRAY[
    'comment_reactions',   -- references comments
    'comments',            -- references stories, users
    'story_tags',          -- references stories
    'follows',             -- references users
    'reactions',           -- references stories, users
    'messages',            -- references conversations, users
    'conversations',       -- references users
    'notifications',       -- references users
    'rentals',             -- references users, books
    'rental_extensions',   -- references rentals
    'library',             -- references users, books
    'reading_progress',    -- references users, books
    'contest_votes',       -- references contest_submissions, users
    'contest_submissions', -- references contests, users
    'contest_prizes',      -- references contests, contest_submissions
    'refunds',             -- references payments
    'payment_transactions',-- references payments
    'payments',            -- references users
    'uploads',             -- no FKs
    'reports',             -- references users
    'moderation_actions',  -- references reports, users
    'user_restrictions',   -- references users
    'user_badges',         -- references users, badges
    'books',               -- references users (owner_id)
    'rentals',             -- already listed
    'stories',             -- references users
    'books',               -- already listed
    'users'                -- LAST: no outgoing FKs that cascade from here
  ]) LOOP
    -- Build dynamic SQL for this table
    v_sql := format(
      'DELETE FROM %I WHERE deleted_at IS NOT NULL AND deleted_at < $1',
      v_table
    );

    IF p_dry_run THEN
      -- Count only
      EXECUTE format('SELECT COUNT(*) FROM %I WHERE deleted_at IS NOT NULL AND deleted_at < $1', v_table)
      USING v_cutoff INTO v_deleted;
    ELSE
      -- Actual delete with batch size limit
      v_sql := v_sql || ' AND ctid IN (SELECT ctid FROM ' || v_table ||
                ' WHERE deleted_at IS NOT NULL AND deleted_at < $1 LIMIT ' || p_batch_size || ')';
      EXECUTE v_sql USING v_cutoff;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
    END IF;

    RETURN QUERY SELECT v_table, v_deleted;
  END LOOP;
END;
$$;

--> statement-breakpoint

-- Grant execute to the application role (adjust role name as needed)
-- GRANT EXECUTE ON FUNCTION purge_soft_deleted(integer, integer, boolean) TO hakawi_app;

--> statement-breakpoint

-- ============================================================
-- USAGE EXAMPLES
-- ============================================================
-- -- Dry run (count only):
-- SELECT * FROM purge_soft_deleted(1000, 30, true);
--
-- -- Actual purge (1000 rows per table, 30-day retention):
-- SELECT * FROM purge_soft_deleted(1000, 30, false);
--
-- -- Aggressive purge (5000 rows, 7-day retention):
-- SELECT * FROM purge_soft_deleted(5000, 7, false);
--
-- -- Schedule via cron (run daily at 3 AM):
-- -- 0 3 * * * psql -d hakawi -c "SELECT * FROM purge_soft_deleted(1000, 30, false);"
--
-- -- Log to table:
-- INSERT INTO purge_job_runs (tables_processed, rows_deleted, status)
-- SELECT jsonb_object_agg(table_name, rows_deleted), SUM(rows_deleted), 'completed'
-- FROM purge_soft_deleted(1000, 30, false);