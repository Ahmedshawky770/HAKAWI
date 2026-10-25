-- Migration 0038: Column-level encryption for sensitive data using pgcrypto.
--
-- WHY. `users.phone`, `users.email` and `payments.metadata` hold PII and
-- financial details in plain text. While `encryption.config.ts` protects
-- password-reset tokens at the application layer, the database rows themselves
-- are readable by anyone with database access (superuser, dump files,
-- logical replication consumers, pg_stat_statements). Column-level encryption
-- ensures the plaintext never persists on disk.
--
-- PRINCIPLES:
--   #15 Proactive Defense — encryption at rest is a preventive control, not a
--     reactive one.
--   #5 Architecture Before Code — the key is supplied through PostgreSQL
--     `current_setting('app.encryption_key', true)`, set once per cluster at
--     startup (see `docs/deployment/environment.md` → *Database encryption*).
--   #9 SSOT — one encryption key, one pair of encrypt/decrypt functions, one
--     set of encrypted columns.
--
-- STRATEGY:
--   1. Enable the pgcrypto extension.
--   2. Create `encrypt_sensitive(text)` and `decrypt_sensitive(bytea)` SQL
--      functions keyed by `current_setting('app.encryption_key', true)`.
--   3. Add `*_encrypted` bytea columns alongside the existing plaintext
--      columns (additive migration — no existing column is dropped).
--   4. Application code writes to both columns (plaintext for compatibility,
--      encrypted for security) and reads from the encrypted column when
--      confidentiality is required; plaintext columns are deprecated.
--   5. A follow-up migration can drop plaintext columns once all readers have
--      migrated to the decrypted values.
--
-- KEY MANAGEMENT. The operator must set `app.encryption_key` in PostgreSQL
-- before running this migration:
--   ALTER SYSTEM SET app.encryption_key = '<base64-encoded-256-bit-key>';
--   SELECT pg_reload_conf();
-- The key must be identical on every replica and every node, or decryption
-- will silently fail.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

--> statement-breakpoint

-- Encrypt a plaintext string using AES-256 (pgp_sym_encrypt) keyed by the
-- application encryption key stored in a PostgreSQL custom GUC.
CREATE OR REPLACE FUNCTION encrypt_sensitive(plaintext text)
RETURNS bytea AS $$
DECLARE
  key text := current_setting('app.encryption_key', true);
BEGIN
  IF key IS NULL OR key = '' THEN
    RAISE EXCEPTION 'app.encryption_key is not set. Set it via ALTER SYSTEM before using encrypt_sensitive.';
  END IF;
  RETURN pgp_sym_encrypt(plaintext, key);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

--> statement-breakpoint

-- Decrypt a bytea ciphertext back to plaintext. Returns NULL when the input
-- is NULL so callers can treat it as a normal nullable column.
CREATE OR REPLACE FUNCTION decrypt_sensitive(ciphertext bytea)
RETURNS text AS $$
DECLARE
  key text := current_setting('app.encryption_key', true);
BEGIN
  IF ciphertext IS NULL THEN
    RETURN NULL;
  END IF;
  IF key IS NULL OR key = '' THEN
    RAISE EXCEPTION 'app.encryption_key is not set. Set it via ALTER SYSTEM before using decrypt_sensitive.';
  END IF;
  RETURN pgp_sym_decrypt(ciphertext, key);
END;
$$ LANGUAGE plpgsql STABLE;

--> statement-breakpoint

-- Encrypted mirror of users.phone (PII).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS phone_encrypted bytea;

--> statement-breakpoint

-- Encrypted mirror of users.email (PII + identifier).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS email_encrypted bytea;

--> statement-breakpoint

-- Encrypted mirror of payments.metadata (financial gateway payload).
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS metadata_encrypted bytea;

--> statement-breakpoint

-- Backfill existing plaintext values into the encrypted columns.
-- Runs once; new writes are expected to populate the encrypted column directly.
UPDATE "users" SET phone_encrypted = encrypt_sensitive(phone)
WHERE phone IS NOT NULL AND phone_encrypted IS NULL;

--> statement-breakpoint

UPDATE "users" SET email_encrypted = encrypt_sensitive(email)
WHERE email IS NOT NULL AND email_encrypted IS NULL;

--> statement-breakpoint

UPDATE "payments" SET metadata_encrypted = encrypt_sensitive(metadata)
WHERE metadata IS NOT NULL AND metadata_encrypted IS NULL;

-- ============================================================
-- Down script: 0038_column_level_encryption.down.sql
-- Reversibility: data-loss — drops the encrypted columns and the encrypt/
-- decrypt functions. Plaintext columns are untouched, so no application data
-- is lost from the main tables. The encrypted copies are lost (they are
-- derived from plaintext).
-- Re-run with --allow-data-loss.
-- ============================================================
