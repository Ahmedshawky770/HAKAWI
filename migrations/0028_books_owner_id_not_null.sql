-- Enforce NOT NULL on books.owner_id.
--
-- WHY. Migration 0021 added `owner_id` as nullable because pre-existing books
-- couldn't be safely matched to users. Migration 0025 backfilled all books
-- where the author name matched exactly one user. The remaining NULLs are
-- books with ambiguous author names (shared by 2+ users) that require
-- manual admin claiming via `PATCH /books/:id`.
--
-- WHY THIS MIGRATION IS SEPARATE. Principle #6: "Add nullable columns first,
-- backfill, then make required." The backfill (0025) and the constraint
-- are separate steps so each can be verified independently. The constraint
-- is only applied after all environments confirm zero NULL owners.
--
-- PRECONDITION. This migration MUST only run after:
--   1. Migration 0025 has been applied and the backfill verified
--   2. All NULL owners have been claimed (manually or auto)
--   3. `SELECT COUNT(*) FROM books WHERE owner_id IS NULL;` returns 0
--
-- If this migration runs with NULLs present, it WILL FAIL — which is the
-- correct behavior. The failure protects against a silent constraint
-- violation that would corrupt the ownership model.

-- Verify no NULL owners exist (fails fast if they do)
DO $$
DECLARE
  v_null_count integer;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM "books" WHERE "owner_id" IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'books.owner_id has % NULL values. Run admin claiming first.', v_null_count;
  END IF;
END $$;

--> statement-breakpoint

-- Apply NOT NULL constraint
ALTER TABLE "books" ALTER COLUMN "owner_id" SET NOT NULL;

--> statement-breakpoint

-- The FK already exists from migration 0021, so no additional constraint needed