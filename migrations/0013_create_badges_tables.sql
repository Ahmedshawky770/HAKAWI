CREATE TABLE IF NOT EXISTS "badges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "icon" varchar(255),
  "criteria" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_badges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "badge_id" uuid NOT NULL REFERENCES "badges"("id") ON DELETE CASCADE,
  "awarded_at" timestamp DEFAULT now() NOT NULL,
  "awarded_by" uuid REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_badges_unique_idx" ON "user_badges" ("user_id", "badge_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "badges_name_idx" ON "badges" ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_badges_user_id_idx" ON "user_badges" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_badges_badge_id_idx" ON "user_badges" ("badge_id");