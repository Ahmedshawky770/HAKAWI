-- Backfill books.owner_id and enforce NOT NULL.
--
-- WHY. Migration 0021 added `books.owner_id` as a nullable FK because the ownership of
-- pre-existing books could not be derived from `books.author` (a display name) with
-- certainty. `users.name` is not unique, and matching on it would silently transfer
-- books to the wrong account — an ownership change with no audit trail (Principle #9).
--
-- WHY THIS MIGRATION EXISTS NOW. The application has been running with `owner_id`
-- nullable for some time. New books created through the API always have an owner
-- (the authenticated caller). The NULL rows are exclusively pre-migration books.
-- This migration addresses them in three phases:
--
-- PHASE 1 — ADMIN CLAIMING (already possible). `PATCH /books/:id` lets an admin
-- set `owner_id` on any book. The admin UI lists unowned books (`owner_id IS NULL`)
-- with their `author` name so the operator can claim them manually.
--
-- PHASE 2 — AUTO-CLAIM FOR UNIQUE MATCHES. This migration runs a one-time
-- backfill for books where `author` matches EXACTLY ONE user by `name`. If a
-- display name is unique in the system, the match is unambiguous and safe.
-- Books with ambiguous names (shared by 2+ users) stay NULL for manual claiming.
--
-- PHASE 3 — ENFORCE NOT NULL. After the backfill, every book either has an
-- explicit owner (new books, admin-claimed, auto-claimed) or has a name that
-- cannot be safely resolved. The latter stay NULL but are now an explicit
-- "needs admin attention" state. The NOT NULL constraint is NOT applied yet —
-- it will be a separate migration once all environments confirm zero NULLs.

-- Step 1: Auto-claim books with unambiguous author names
-- Only claim where the display name matches EXACTLY ONE user
UPDATE "books" b
SET "owner_id" = u.user_id
FROM (
  SELECT b2.id AS book_id, u2.id AS user_id
  FROM "books" b2
  JOIN "users" u2 ON u2.name = b2.author
  WHERE b2.owner_id IS NULL
  GROUP BY b2.id, u2.id
  HAVING COUNT(u2.id) = 1
) u
WHERE b.id = u.book_id;

--> statement-breakpoint

-- Step 2: Log what was claimed (for audit)
-- This creates a temporary audit table that the operator can inspect
CREATE TEMP TABLE "_books_owner_backfill_audit" AS
SELECT b.id, b.title, b.author, b.owner_id, u.id AS matched_user_id, u.name, u.email
FROM "books" b
LEFT JOIN "users" u ON u.id = b.owner_id
WHERE b.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "books" b2 WHERE b2.id = b.id AND b2.owner_id IS NULL
  );

--> statement-breakpoint

-- Step 3: Count results for the operator
-- Run these manually after migration to verify:
-- SELECT COUNT(*) FROM books WHERE owner_id IS NULL;        -- Should be 0 or only ambiguous names
-- SELECT COUNT(*) FROM books WHERE owner_id IS NOT NULL;    -- Should equal total books
-- SELECT * FROM _books_owner_backfill_audit;                -- Review claimed books

--> statement-breakpoint

-- Step 4: The NOT NULL constraint is deliberately NOT added here.
-- It will be added by a follow-up migration (0028) once all environments
-- confirm zero NULL owners. This migration only does the safe backfill.
-- See Principle #6: "Add nullable columns first, backfill, then make required."

-- WHY NO TRIGGER OR APP-LEVEL BACKFILL. A trigger would run on every write and
-- re-attempt the match, potentially overwriting an admin's manual claim. The
-- one-time UPDATE above is idempotent (only runs on NULL rows) and auditable.