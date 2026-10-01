-- hakawi:down reversibility=data-loss data-loss=columns reason=Drops password_reset_token. In-flight password resets are invalidated, which is the intended effect of a rollback.
DROP INDEX IF EXISTS "idx_users_password_reset_token";
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_reset_token";
