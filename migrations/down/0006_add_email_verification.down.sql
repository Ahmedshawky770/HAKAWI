-- hakawi:down reversibility=data-loss data-loss=columns reason=Drops the email_verified flag and the in-flight email_verification_token column. Any partially completed verification loses its token.
DROP INDEX IF EXISTS "idx_users_email_verification_token";
ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verification_token";
ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified";
