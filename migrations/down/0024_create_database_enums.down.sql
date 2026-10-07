-- hakawi:down reversibility=data-loss data-loss=columns reason=Converts enum columns back to varchar. The enum values are preserved as strings, so no data is lost — but the type safety is. Any invalid varchar that was rejected by the enum will now be accepted. This is a deliberate downgrade: the enum constraint is removed, returning to the pre-migration state where the application was the only validator.
ALTER TABLE "books" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "books" ALTER COLUMN "status" TYPE varchar(20) USING "status"::varchar;
ALTER TABLE "books" ALTER COLUMN "status" SET DEFAULT 'draft';
--> statement-breakpoint
ALTER TABLE "library" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "library" ALTER COLUMN "status" TYPE varchar(20) USING "status"::varchar;
ALTER TABLE "library" ALTER COLUMN "status" SET DEFAULT 'owned';
--> statement-breakpoint
ALTER TABLE "moderation_actions" ALTER COLUMN "action" TYPE varchar(20) USING "action"::varchar;
--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "reports" ALTER COLUMN "status" TYPE varchar(20) USING "status"::varchar;
ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'open';
--> statement-breakpoint
ALTER TABLE "payment_transactions" ALTER COLUMN "status" TYPE varchar(20) USING "status"::varchar;
--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "refunds" ALTER COLUMN "status" TYPE varchar(20) USING "status"::varchar;
ALTER TABLE "refunds" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payments" ALTER COLUMN "status" TYPE varchar(20) USING "status"::varchar;
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "rentals" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "rentals" ALTER COLUMN "status" TYPE varchar(20) USING "status"::varchar;
ALTER TABLE "rentals" ALTER COLUMN "status" SET DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "contest_submissions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contest_submissions" ALTER COLUMN "status" TYPE varchar(20) USING "status"::varchar;
ALTER TABLE "contest_submissions" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "contest_prizes" ALTER COLUMN "prize_type" TYPE varchar(50) USING "prize_type"::varchar;
--> statement-breakpoint
ALTER TABLE "contests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contests" ALTER COLUMN "status" TYPE varchar(20) USING "status"::varchar;
ALTER TABLE "contests" ALTER COLUMN "status" SET DEFAULT 'draft';
--> statement-breakpoint
ALTER TABLE "stories" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "stories" ALTER COLUMN "status" TYPE varchar(20) USING "status"::varchar;
ALTER TABLE "stories" ALTER COLUMN "status" SET DEFAULT 'draft';
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "admin_role" TYPE varchar(20) USING "admin_role"::varchar;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "account_type" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "account_type" TYPE varchar(20) USING "account_type"::varchar;
ALTER TABLE "users" ALTER COLUMN "account_type" SET DEFAULT 'reader';
--> statement-breakpoint
-- Drop the enum types (order matters: columns must be converted first)
DROP TYPE IF EXISTS book_status;
--> statement-breakpoint
DROP TYPE IF EXISTS library_status;
--> statement-breakpoint
DROP TYPE IF EXISTS moderation_action_type;
--> statement-breakpoint
DROP TYPE IF EXISTS report_status;
--> statement-breakpoint
DROP TYPE IF EXISTS payment_status;
--> statement-breakpoint
DROP TYPE IF EXISTS rental_status;
--> statement-breakpoint
DROP TYPE IF EXISTS submission_status;
--> statement-breakpoint
DROP TYPE IF EXISTS prize_type;
--> statement-breakpoint
DROP TYPE IF EXISTS contest_status;
--> statement-breakpoint
DROP TYPE IF EXISTS story_status;
--> statement-breakpoint
DROP TYPE IF EXISTS admin_role;
--> statement-breakpoint
DROP TYPE IF EXISTS account_type;