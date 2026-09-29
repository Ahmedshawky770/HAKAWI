CREATE TABLE IF NOT EXISTS "contests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "category_id" uuid REFERENCES "categories"("id"),
  "start_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "submission_deadline" timestamp NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "winner_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contest_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contest_id" uuid NOT NULL REFERENCES "contests"("id") ON DELETE CASCADE,
  "story_id" uuid NOT NULL REFERENCES "stories"("id"),
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "submitted_at" timestamp DEFAULT now() NOT NULL,
  "reviewed_at" timestamp,
  "reviewed_by" uuid REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contest_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contest_id" uuid NOT NULL REFERENCES "contests"("id") ON DELETE CASCADE,
  "submission_id" uuid NOT NULL REFERENCES "contest_submissions"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE ("contest_id", "submission_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contest_prizes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contest_id" uuid NOT NULL REFERENCES "contests"("id") ON DELETE CASCADE,
  "submission_id" uuid NOT NULL REFERENCES "contest_submissions"("id") ON DELETE CASCADE,
  "winner_id" uuid NOT NULL REFERENCES "users"("id"),
  "prize_type" varchar(50) NOT NULL,
  "prize_description" text,
  "distributed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contests_category_id_idx" ON "contests" ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contests_status_idx" ON "contests" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contests_created_by_idx" ON "contests" ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contests_start_date_idx" ON "contests" ("start_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contests_end_date_idx" ON "contests" ("end_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_submissions_contest_id_idx" ON "contest_submissions" ("contest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_submissions_author_id_idx" ON "contest_submissions" ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_submissions_status_idx" ON "contest_submissions" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_votes_unique_idx" ON "contest_votes" ("contest_id", "submission_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_votes_contest_id_idx" ON "contest_votes" ("contest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_votes_user_id_idx" ON "contest_votes" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_prizes_contest_id_idx" ON "contest_prizes" ("contest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contest_prizes_winner_id_idx" ON "contest_prizes" ("winner_id");
