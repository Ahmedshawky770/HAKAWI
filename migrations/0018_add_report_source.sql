ALTER TABLE "reports" ALTER COLUMN "reporter_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_source_check" CHECK ("source" IN ('user', 'auto'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_source_idx" ON "reports" ("source");
