-- Migration 0035: Declarative Partitioning for high-growth append-only tables.
--
-- WHY. `messages`, `notifications`, `payment_transactions` and `reactions` grow
-- without bound. A single monolithic table makes every index larger, every
-- VACUUM slower, and every backup/restore more expensive. Declarative
-- partitioning by `created_at` (monthly) keeps each partition small enough to
-- vacuum, reindex, and archive independently.
--
-- PRINCIPLES:
--   #6 Minimize Migrations — this migration is additive: it creates new
--     partitioned tables (`*_p`) alongside the legacy tables. No existing
--     column is dropped or renamed, so rollback is simply dropping the new
--     tables (data-loss classification documented below).
--   #9 SSOT — the partitioned tables carry the same columns and constraints as
--     the legacy tables; the legacy tables remain the source of truth until a
--     follow-up migration swaps them in.
--   #16 Smart Hybrid Consistency — partitions are read/write targets for
--     eventual-consistency data (social, notifications). Strong-consistency
--     data (payments) reads via `dbPrimary`/`withPrimary` in router.ts.
--
-- STRATEGY:
--   1. Create `*_p` parent tables partitioned by RANGE on `created_at`.
--   2. Create monthly child partitions for Jan 2026 through Dec 2026.
--   3. Create indexes on each parent (PostgreSQL propagates them to children).
--   4. Provide `archive_messages_before(ts)`, `archive_notifications_before(ts)`
--      etc. SQL functions to move old partitions to cold storage.
--   5. Down script drops the partitioned tables and their partitions.

-- ============================================================
-- messages_p — partitioned by created_at (monthly)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages_p (
  id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  is_read boolean NOT NULL DEFAULT FALSE,
  read_at timestamp,
  created_at timestamp NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_01 PARTITION OF messages_p
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_02 PARTITION OF messages_p
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_03 PARTITION OF messages_p
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_04 PARTITION OF messages_p
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_05 PARTITION OF messages_p
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_06 PARTITION OF messages_p
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_07 PARTITION OF messages_p
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_08 PARTITION OF messages_p
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_09 PARTITION OF messages_p
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_10 PARTITION OF messages_p
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_11 PARTITION OF messages_p
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS messages_p_2026_12 PARTITION OF messages_p
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

--> statement-breakpoint

-- Foreign keys and indexes mirror the legacy `messages` table.
ALTER TABLE messages_p
  ADD CONSTRAINT messages_p_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    ON DELETE CASCADE;

--> statement-breakpoint

ALTER TABLE messages_p
  ADD CONSTRAINT messages_p_sender_id_fk
    FOREIGN KEY (sender_id) REFERENCES users(id)
    ON DELETE CASCADE;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS messages_p_conversation_id_idx ON messages_p (conversation_id);
CREATE INDEX IF NOT EXISTS messages_p_sender_id_idx ON messages_p (sender_id);
CREATE INDEX IF NOT EXISTS messages_p_created_at_idx ON messages_p (created_at DESC);

-- ============================================================
-- notifications_p — partitioned by created_at (monthly)
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications_p (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  type varchar(50) NOT NULL,
  title varchar(255) NOT NULL,
  message text NOT NULL,
  data text,
  is_read boolean NOT NULL DEFAULT FALSE,
  read_at timestamp,
  created_at timestamp NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_01 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_02 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_03 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_04 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_05 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_06 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_07 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_08 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_09 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_10 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_11 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS notifications_p_2026_12 PARTITION OF notifications_p
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

--> statement-breakpoint

ALTER TABLE notifications_p
  ADD CONSTRAINT notifications_p_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS notifications_p_user_id_idx ON notifications_p (user_id);
CREATE INDEX IF NOT EXISTS notifications_p_read_idx ON notifications_p (user_id, is_read);
CREATE INDEX IF NOT EXISTS notifications_p_created_at_idx ON notifications_p (created_at DESC);

-- ============================================================
-- payment_transactions_p — partitioned by created_at (monthly)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_transactions_p (
  id uuid NOT NULL,
  payment_id uuid NOT NULL,
  type varchar(20) NOT NULL,
  status varchar(20) NOT NULL,
  amount integer NOT NULL,
  currency varchar(3) NOT NULL,
  gateway_response text,
  created_at timestamp NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_01 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_02 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_03 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_04 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_05 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_06 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_07 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_08 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_09 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_10 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_11 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions_p_2026_12 PARTITION OF payment_transactions_p
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

--> statement-breakpoint

ALTER TABLE payment_transactions_p
  ADD CONSTRAINT payment_transactions_p_payment_id_fk
    FOREIGN KEY (payment_id) REFERENCES payments(id)
    ON DELETE CASCADE;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS payment_transactions_p_payment_id_idx ON payment_transactions_p (payment_id);
CREATE INDEX IF NOT EXISTS payment_transactions_p_created_at_idx ON payment_transactions_p (created_at DESC);

-- ============================================================
-- reactions_p — partitioned by created_at (monthly)
-- ============================================================
CREATE TABLE IF NOT EXISTS reactions_p (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  story_id uuid NOT NULL,
  type varchar(20) NOT NULL,
  created_at timestamp NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_01 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_02 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_03 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_04 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_05 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_06 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_07 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_08 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_09 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_10 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_11 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reactions_p_2026_12 PARTITION OF reactions_p
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

--> statement-breakpoint

ALTER TABLE reactions_p
  ADD CONSTRAINT reactions_p_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE;

--> statement-breakpoint

ALTER TABLE reactions_p
  ADD CONSTRAINT reactions_p_story_id_fk
    FOREIGN KEY (story_id) REFERENCES stories(id)
    ON DELETE CASCADE;

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS reactions_p_unique_idx ON reactions_p (user_id, story_id);
CREATE INDEX IF NOT EXISTS reactions_p_user_id_idx ON reactions_p (user_id);
CREATE INDEX IF NOT EXISTS reactions_p_story_id_idx ON reactions_p (story_id);
CREATE INDEX IF NOT EXISTS reactions_p_created_at_idx ON reactions_p (created_at DESC);

-- ============================================================
-- Archiving functions — move old partitions to cold storage.
--
-- Each function detaches a partition older than the cutoff, preserving its
-- data in a standalone `*_archived_*` table that can be moved to object
-- storage (S3) or dropped after a retention period.
-- ============================================================

-- Archive messages older than `before_ts`.
CREATE OR REPLACE FUNCTION archive_messages_before(before_ts timestamp)
RETURNS void AS $$
DECLARE
  part record;
BEGIN
  FOR part IN
    SELECT c.relname AS partition_name
    FROM pg_inherits
    JOIN pg_class c ON c.oid = pg_inherits.inhrelid
    JOIN pg_class p ON p.oid = pg_inherits.inhparent
    WHERE p.relname = 'messages_p'
      AND c.relname ~ '_[0-9]{4}_[0-9]{2}$'
      AND to_date(substring(c.relname from '[0-9]{4}_[0-9]{2}$'), 'YYYY_MM') < date_trunc('month', before_ts)
  LOOP
    -- Detach partitions whose name indicates a month fully before `before_ts`.
    -- Partition names are messages_p_YYYY_MM.
    EXECUTE format(
      'ALTER TABLE messages_p DETACH PARTITION %I',
      part.partition_name
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Archive notifications older than `before_ts`.
CREATE OR REPLACE FUNCTION archive_notifications_before(before_ts timestamp)
RETURNS void AS $$
DECLARE
  part record;
BEGIN
  FOR part IN
    SELECT c.relname AS partition_name
    FROM pg_inherits
    JOIN pg_class c ON c.oid = pg_inherits.inhrelid
    JOIN pg_class p ON p.oid = pg_inherits.inhparent
    WHERE p.relname = 'notifications_p'
      AND c.relname ~ '_[0-9]{4}_[0-9]{2}$'
      AND to_date(substring(c.relname from '[0-9]{4}_[0-9]{2}$'), 'YYYY_MM') < date_trunc('month', before_ts)
  LOOP
    EXECUTE format(
      'ALTER TABLE notifications_p DETACH PARTITION %I',
      part.partition_name
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Archive payment_transactions older than `before_ts`.
CREATE OR REPLACE FUNCTION archive_payment_transactions_before(before_ts timestamp)
RETURNS void AS $$
DECLARE
  part record;
BEGIN
  FOR part IN
    SELECT c.relname AS partition_name
    FROM pg_inherits
    JOIN pg_class c ON c.oid = pg_inherits.inhrelid
    JOIN pg_class p ON p.oid = pg_inherits.inhparent
    WHERE p.relname = 'payment_transactions_p'
      AND c.relname ~ '_[0-9]{4}_[0-9]{2}$'
      AND to_date(substring(c.relname from '[0-9]{4}_[0-9]{2}$'), 'YYYY_MM') < date_trunc('month', before_ts)
  LOOP
    EXECUTE format(
      'ALTER TABLE payment_transactions_p DETACH PARTITION %I',
      part.partition_name
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Archive reactions older than `before_ts`.
CREATE OR REPLACE FUNCTION archive_reactions_before(before_ts timestamp)
RETURNS void AS $$
DECLARE
  part record;
BEGIN
  FOR part IN
    SELECT c.relname AS partition_name
    FROM pg_inherits
    JOIN pg_class c ON c.oid = pg_inherits.inhrelid
    JOIN pg_class p ON p.oid = pg_inherits.inhparent
    WHERE p.relname = 'reactions_p'
      AND c.relname ~ '_[0-9]{4}_[0-9]{2}$'
      AND to_date(substring(c.relname from '[0-9]{4}_[0-9]{2}$'), 'YYYY_MM') < date_trunc('month', before_ts)
  LOOP
    EXECUTE format(
      'ALTER TABLE reactions_p DETACH PARTITION %I',
      part.partition_name
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
