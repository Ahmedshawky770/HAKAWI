-- Database enums for type-safe status columns.
--
-- WHY. Every status column in the schema is currently `varchar(20)` with application-level
-- validation only. That means:
--   1. The database accepts any string — typos like 'pulished' or 'activ' persist silently.
--   2. No foreign-key-style referential integrity exists between a status and its allowed set.
--   3. The application is the sole guardian, and a bug in one service bypasses the checks of all others.
--
-- WHY POSTGRESQL ENUMS AND NOT A LOOKUP TABLE. A lookup table (e.g. `account_types`) adds a join
-- to every query and a row to every insert. An enum is a native type: the check is a single CPU
-- instruction at write time, zero overhead at read time, and the allowed values are documented in
-- the schema itself. Principle #9 (Single Source of Truth) — the enum definition IS the truth.
--
-- WHY NOT IN THE ORIGINAL TABLE CREATIONS. Principle #6 (Minimize Migrations) asks for additive
-- changes to live tables to be separate, named, and reversible. This migration touches 13 tables
-- and 10 enum types; folding it into 10 different original migrations would make rollback of any
-- one of them impossible without rolling back all.

-- Enum: account_type (users.account_type)
CREATE TYPE account_type AS ENUM ('reader', 'writer', 'rising_star', 'professional', 'publisher', 'admin');

--> statement-breakpoint

-- Enum: admin_role (users.admin_role)
CREATE TYPE admin_role AS ENUM ('super_admin', 'content_moderator', 'financial_officer', 'verification_officer');

--> statement-breakpoint

-- Enum: story_status (stories.status)
CREATE TYPE story_status AS ENUM ('draft', 'pending', 'approved', 'published', 'archived', 'rejected');

--> statement-breakpoint

-- Enum: contest_status (contests.status)
CREATE TYPE contest_status AS ENUM ('draft', 'published', 'active', 'voting', 'completed', 'cancelled');

--> statement-breakpoint

-- Enum: prize_type (contest_prizes.prize_type)
CREATE TYPE prize_type AS ENUM ('cash', 'badge', 'recognition', 'publication');

--> statement-breakpoint

-- Enum: submission_status (contest_submissions.status)
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected', 'winner', 'runner_up');

--> statement-breakpoint

-- Enum: rental_status (rentals.status)
CREATE TYPE rental_status AS ENUM ('active', 'expired', 'cancelled', 'pending');

--> statement-breakpoint

-- Enum: payment_status (payments.status, refunds.status, payment_transactions.status)
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded', 'cancelled');

--> statement-breakpoint

-- Enum: report_status (reports.status)
CREATE TYPE report_status AS ENUM ('open', 'in_review', 'resolved', 'dismissed');

--> statement-breakpoint

-- Enum: moderation_action_type (moderation_actions.type)
CREATE TYPE moderation_action_type AS ENUM ('warn', 'mute', 'ban', 'delete', 'restore');

--> statement-breakpoint

-- Enum: library_status (library.status)
CREATE TYPE library_status AS ENUM ('owned', 'rented', 'archived');

--> statement-breakpoint

-- Enum: book_status (books.status)
CREATE TYPE book_status AS ENUM ('draft', 'published', 'archived');

--> statement-breakpoint

-- Enum: reading_progress_status (reading_progress — not currently a status column, reserved)
-- CREATE TYPE reading_progress_status AS ENUM ('not_started', 'in_progress', 'completed');
-- RESERVED: not applied yet, no column uses it.

--> statement-breakpoint

-- Enum: notification_type (notifications.type)
-- The values are dynamic (one per notification family) and the family map lives in
-- backend/src/modules/notifications/preference-family.ts. Creating an enum here would
-- couple the schema to a list that changes per release. Kept as varchar.

-- ============================================================
-- ALTER COLUMNS TO USE ENUMS
-- ============================================================

-- users.account_type
ALTER TABLE "users" ALTER COLUMN "account_type" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "account_type" TYPE account_type
  USING "account_type"::account_type;
ALTER TABLE "users" ALTER COLUMN "account_type" SET DEFAULT 'reader'::account_type;

--> statement-breakpoint

-- users.admin_role
ALTER TABLE "users"
  ALTER COLUMN "admin_role" TYPE admin_role
  USING "admin_role"::admin_role;

--> statement-breakpoint

-- stories.status
ALTER TABLE "stories" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "stories"
  ALTER COLUMN "status" TYPE story_status
  USING "status"::story_status;
ALTER TABLE "stories" ALTER COLUMN "status" SET DEFAULT 'draft'::story_status;

--> statement-breakpoint

-- contests.status
ALTER TABLE "contests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contests"
  ALTER COLUMN "status" TYPE contest_status
  USING "status"::contest_status;
ALTER TABLE "contests" ALTER COLUMN "status" SET DEFAULT 'draft'::contest_status;

--> statement-breakpoint

-- contest_prizes.prize_type
ALTER TABLE "contest_prizes"
  ALTER COLUMN "prize_type" TYPE prize_type
  USING "prize_type"::prize_type;

--> statement-breakpoint

-- contest_submissions.status
ALTER TABLE "contest_submissions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contest_submissions"
  ALTER COLUMN "status" TYPE submission_status
  USING "status"::submission_status;
ALTER TABLE "contest_submissions" ALTER COLUMN "status" SET DEFAULT 'pending'::submission_status;

--> statement-breakpoint

-- rentals.status
ALTER TABLE "rentals" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "rentals"
  ALTER COLUMN "status" TYPE rental_status
  USING "status"::rental_status;
ALTER TABLE "rentals" ALTER COLUMN "status" SET DEFAULT 'active'::rental_status;

--> statement-breakpoint

-- payments.status
ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payments"
  ALTER COLUMN "status" TYPE payment_status
  USING "status"::payment_status;
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending'::payment_status;

--> statement-breakpoint

-- refunds.status
ALTER TABLE "refunds" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "refunds"
  ALTER COLUMN "status" TYPE payment_status
  USING "status"::payment_status;
ALTER TABLE "refunds" ALTER COLUMN "status" SET DEFAULT 'pending'::payment_status;

--> statement-breakpoint

-- payment_transactions.status
ALTER TABLE "payment_transactions"
  ALTER COLUMN "status" TYPE payment_status
  USING "status"::payment_status;

--> statement-breakpoint

-- reports.status
ALTER TABLE "reports" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "reports"
  ALTER COLUMN "status" TYPE report_status
  USING "status"::report_status;
ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'open'::report_status;

--> statement-breakpoint

-- moderation_actions.action
ALTER TABLE "moderation_actions"
  ALTER COLUMN "action" TYPE moderation_action_type
  USING "action"::moderation_action_type;

--> statement-breakpoint

-- library.status
ALTER TABLE "library" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "library"
  ALTER COLUMN "status" TYPE library_status
  USING "status"::library_status;
ALTER TABLE "library" ALTER COLUMN "status" SET DEFAULT 'owned'::library_status;

--> statement-breakpoint

-- books.status
ALTER TABLE "books" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "books"
  ALTER COLUMN "status" TYPE book_status
  USING "status"::book_status;
ALTER TABLE "books" ALTER COLUMN "status" SET DEFAULT 'draft'::book_status;

--> statement-breakpoint

-- ============================================================
-- VERIFICATION QUERIES (run manually after migration)
-- ============================================================
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'account_type'::regtype ORDER BY enumsortorder;
-- Should return: reader, writer, rising_star, professional, publisher, admin
--
-- SELECT DISTINCT status FROM stories; -- Should only show enum values