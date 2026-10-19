-- Add representation/agency and extended profile fields to users table
--
-- WHY. The codebase now supports agent/representation model (represented scope,
-- books:sell:represented) and extended profile fields (phone, website, cover,
-- socialLinks). The Drizzle schema and application code were updated but no
-- migration existed, which would cause runtime errors (column does not exist).
-- This migration brings DB in sync with the schema.
--
-- Principle alignment: Single Source of Truth (#9), Fail Fast (#6) avoided by
-- adding nullable columns with defaults where safe.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "cover" text,
  ADD COLUMN IF NOT EXISTS "website" varchar(255),
  ADD COLUMN IF NOT EXISTS "phone" varchar(32),
  ADD COLUMN IF NOT EXISTS "social_links" jsonb,
  ADD COLUMN IF NOT EXISTS "is_agent" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "agency_name" varchar(255),
  ADD COLUMN IF NOT EXISTS "agent_license" varchar(255),
  ADD COLUMN IF NOT EXISTS "can_represent_others" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "represented_by_id" uuid,
  ADD COLUMN IF NOT EXISTS "representation_notes" text;

--> statement-breakpoint

-- Foreign key for representation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_represented_by_id_users_id_fk'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_represented_by_id_users_id_fk"
        FOREIGN KEY ("represented_by_id")
          REFERENCES "users"("id")
          ON DELETE SET NULL
          ON UPDATE CASCADE;
  END IF;
END $$;

--> statement-breakpoint

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS "users_represented_by_id_idx" ON "users" ("represented_by_id");
CREATE INDEX IF NOT EXISTS "users_is_agent_idx" ON "users" ("is_agent");
