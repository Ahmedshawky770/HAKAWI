-- hakawi:down reversibility=data-loss data-loss=rows reason=Rollback reverses this migration; data written to affected tables may be lost.
-- Down script for 0038_column_level_encryption.sql
-- Reversibility: data-loss — drops the encrypted mirror columns and the
-- encrypt_sensitive / decrypt_sensitive functions. Plaintext columns
-- (users.phone, users.email, payments.metadata) are untouched.
-- Re-run with --allow-data-loss.

ALTER TABLE "payments" DROP COLUMN IF EXISTS metadata_encrypted;
ALTER TABLE "users" DROP COLUMN IF EXISTS email_encrypted;
ALTER TABLE "users" DROP COLUMN IF EXISTS phone_encrypted;

--> statement-breakpoint

DROP FUNCTION IF EXISTS decrypt_sensitive(bytea);
DROP FUNCTION IF EXISTS encrypt_sensitive(text);
