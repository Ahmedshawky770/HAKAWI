-- Migration 0037: Enforce NOT NULL on books.owner_id.
--
-- WHY. Migration 0021 added `books.owner_id` as a nullable FK because the ownership
-- of pre-existing books could not be derived from `books.author` (a display name)
-- with certainty. Migration 0025 backfilled unambiguous matches. The remaining NULLs
-- are books with ambiguous author names that require manual admin claiming via
-- `PATCH /books/:id`.
--
-- PRINCIPLES:
--   #6 Minimize Migrations — this is a data-only constraint change, separate from
--     the backfill so each step can be verified independently.
--   #9 SSOT — `owner_id` becomes the database-enforced source of truth for book
--     ownership; `author` remains a display-only field.
--
-- PRECONDITION. This migration MUST only run after:
--   1. Migration 0025 has been applied and the backfill verified
--   2. All NULL owners have been claimed (manually via PATCH /books/:id)
--   3. `SELECT COUNT(*) FROM books WHERE owner_id IS NULL;` returns 0
--
-- If NULLs remain, the migration FAILS FAST — protecting against a silent
-- constraint violation that would corrupt the ownership model.

-- Verify no NULL owners exist (fails fast if they do)
DO $$
DECLARE
  v_null_count integer;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM "books" WHERE "owner_id" IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'books.owner_id has % NULL values. Run admin claiming via PATCH /books/:id first.', v_null_count;
  END IF;
END $$;

--> statement-breakpoint

-- Apply NOT NULL constraint
ALTER TABLE "books" ALTER COLUMN "owner_id" SET NOT NULL;

-- ============================================================
-- Down script: 0037_books_owner_id_not_null.down.sql
-- Reversibility: data-loss — removing NOT NULL is safe (no data lost), but the
-- constraint itself is dropped so new NULL owners become possible again.
-- Re-run with --allow-data-loss.
-- ============================================================
