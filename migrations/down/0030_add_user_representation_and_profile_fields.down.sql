-- hakawi:down reversibility=data-loss data-loss=columns reason=Drops the representation/agency and extended profile columns added to users. Agent/representation settings, contact details, cover, website, and social links entered by users are lost; user accounts themselves remain intact.
DROP INDEX IF EXISTS "users_is_agent_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "users_represented_by_id_idx";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_represented_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "representation_notes";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "represented_by_id";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "can_represent_others";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "agent_license";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "agency_name";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "is_agent";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "social_links";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "phone";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "website";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "cover";
