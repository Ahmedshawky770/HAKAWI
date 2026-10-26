-- Migration 0036: Separate counters table — Single Source of Truth for counters.
--
-- WHY. `stories.view_count`, `stories.like_count`, `stories.comment_count`,
-- `books.view_count`, `books.like_count`, `books.download_count`,
-- `comments.like_count` and `comments.reply_count` are denormalized counters
-- stored inside the main entity tables. Every interaction (view, like,
-- comment, download) requires an UPDATE on the parent row — write
-- amplification and a race-condition hazard. Migration 0019
-- (`backfill_denormalised_counters.sql`) already documents that these counters
-- drift from reality and need periodic repair.
--
-- PRINCIPLES:
--   #9 SSOT — `counters` is the single authoritative source for every counter.
--     The columns left on `stories`, `books` and `comments` become read-only
--     caches, refreshed from `counters` by a backfill job. Any read that needs
--     exact consistency goes to `counters`.
--   #6 Minimize Migrations — additive only: creates a new table, drops nothing.
--   #16 Smart Hybrid Consistency — counter reads are eventual (cache) unless
--     the caller asks for strong consistency, in which case it reads `counters`
--     via `withPrimary()`.
--
-- STRATEGY:
--   1. Create `counters` table with (entity_type, entity_id, counter_name)
--      unique constraint — one row per counter.
--   2. Backfill existing counter values from the main tables into `counters`.
--   3. Leave the counter columns on the main tables as read-only caches (no
--      application code writes to them directly anymore).
--   4. A follow-up migration can drop the cache columns once all writers have
--      migrated to `counters`.

CREATE TABLE IF NOT EXISTS counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  entity_type varchar(50) NOT NULL,
  entity_id uuid NOT NULL,
  counter_name varchar(50) NOT NULL,
  value integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT counters_entity_type_entity_id_counter_name_unique
    UNIQUE (entity_type, entity_id, counter_name)
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS counters_entity_type_entity_id_idx
  ON counters (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS counters_entity_id_idx
  ON counters (entity_id);
CREATE INDEX IF NOT EXISTS counters_updated_at_idx
  ON counters (updated_at);

--> statement-breakpoint

-- Backfill story counters from the stories table.
INSERT INTO counters (entity_type, entity_id, counter_name, value, updated_at)
SELECT 'story', id, 'view_count', view_count, updated_at FROM stories
WHERE true
ON CONFLICT (entity_type, entity_id, counter_name) DO NOTHING;

--> statement-breakpoint

INSERT INTO counters (entity_type, entity_id, counter_name, value, updated_at)
SELECT 'story', id, 'like_count', like_count, updated_at FROM stories
WHERE true
ON CONFLICT (entity_type, entity_id, counter_name) DO NOTHING;

--> statement-breakpoint

INSERT INTO counters (entity_type, entity_id, counter_name, value, updated_at)
SELECT 'story', id, 'comment_count', comment_count, updated_at FROM stories
WHERE true
ON CONFLICT (entity_type, entity_id, counter_name) DO NOTHING;

--> statement-breakpoint

-- Backfill book counters from the books table.
INSERT INTO counters (entity_type, entity_id, counter_name, value, updated_at)
SELECT 'book', id, 'view_count', view_count, updated_at FROM books
WHERE true
ON CONFLICT (entity_type, entity_id, counter_name) DO NOTHING;

--> statement-breakpoint

INSERT INTO counters (entity_type, entity_id, counter_name, value, updated_at)
SELECT 'book', id, 'like_count', like_count, updated_at FROM books
WHERE true
ON CONFLICT (entity_type, entity_id, counter_name) DO NOTHING;

--> statement-breakpoint

INSERT INTO counters (entity_type, entity_id, counter_name, value, updated_at)
SELECT 'book', id, 'download_count', download_count, updated_at FROM books
WHERE true
ON CONFLICT (entity_type, entity_id, counter_name) DO NOTHING;

--> statement-breakpoint

-- Backfill comment counters from the comments table.
INSERT INTO counters (entity_type, entity_id, counter_name, value, updated_at)
SELECT 'comment', id, 'like_count', like_count, updated_at FROM comments
WHERE true
ON CONFLICT (entity_type, entity_id, counter_name) DO NOTHING;

--> statement-breakpoint

INSERT INTO counters (entity_type, entity_id, counter_name, value, updated_at)
SELECT 'comment', id, 'reply_count', reply_count, updated_at FROM comments
WHERE true
ON CONFLICT (entity_type, entity_id, counter_name) DO NOTHING;

-- ============================================================
-- Down script: 0036_create_counters_table.down.sql
-- Reversibility: data-loss — drops the counters table. The cache columns on
-- stories, books and comments are untouched, so no application data is lost
-- from the main tables. The counters themselves are lost, which is acceptable
-- because they are derived state (recomputable from the main tables).
-- Re-run with --allow-data-loss.
-- ============================================================
