-- hakawi:down reversibility=reversible data-loss=columns reason=Drops the MFA columns. The TOTP secrets are encrypted credentials; losing them means users with MFA enabled will need to re-enroll. This is acceptable for a rollback because MFA is additive security — removing it returns to the pre-MFA state where admin accounts relied solely on passwords (the documented gap this migration closes).
DROP INDEX IF EXISTS "users_mfa_enabled_idx";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "mfa_enforced_at";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "mfa_enabled";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_secret_encrypted";