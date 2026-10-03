-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops the users table. Every user row and every row that references it is destroyed.
DROP INDEX IF EXISTS "users_account_type_idx";
DROP INDEX IF EXISTS "users_username_idx";
DROP INDEX IF EXISTS "users_email_idx";
DROP TABLE IF EXISTS "users";
