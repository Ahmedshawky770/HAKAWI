-- Publisher Applications and Publisher Writers tables
-- Phase 2: Publisher onboarding and representation model

CREATE TABLE IF NOT EXISTS "publisher_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_name" varchar(255) NOT NULL,
  "company_website" varchar(500),
  "company_address" text,
  "tax_id" varchar(100),
  "contact_name" varchar(255) NOT NULL,
  "contact_email" varchar(255) NOT NULL,
  "contact_phone" varchar(32),
  "description" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'rejected')),
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp,
  "rejection_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "publisher_applications_user_id_unique" ON "publisher_applications" ("user_id");
CREATE INDEX IF NOT EXISTS "publisher_applications_user_id_idx" ON "publisher_applications" ("user_id");
CREATE INDEX IF NOT EXISTS "publisher_applications_status_idx" ON "publisher_applications" ("status");
CREATE INDEX IF NOT EXISTS "publisher_applications_reviewed_by_idx" ON "publisher_applications" ("reviewed_by");

CREATE TABLE IF NOT EXISTS "publisher_writers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "publisher_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "writer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "commission_rate" integer NOT NULL DEFAULT 15,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "publisher_writers_publisher_writer_unique" ON "publisher_writers" ("publisher_id", "writer_id");
CREATE INDEX IF NOT EXISTS "publisher_writers_publisher_id_idx" ON "publisher_writers" ("publisher_id");
CREATE INDEX IF NOT EXISTS "publisher_writers_writer_id_idx" ON "publisher_writers" ("writer_id");