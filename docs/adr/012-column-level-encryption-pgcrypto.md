# ADR-012: Column-Level Encryption with pgcrypto

## Status
Accepted

## Context
`users.phone`, `users.email` and `payments.metadata` hold PII and financial details
in plain text. While `encryption.config.ts` protects password-reset tokens at the
application layer, the database rows themselves are readable by anyone with database
access (superuser, dump files, logical replication consumers, pg_stat_statements).

## Decision
1. `pgcrypto` extension is enabled (`migrations/0038_column_level_encryption.sql`).
2. `encrypt_sensitive(text)` / `decrypt_sensitive(bytea)` SQL functions are keyed by
   `current_setting('app.encryption_key', true)` — one key, set once per cluster at
   startup.
3. `*_encrypted` bytea mirror columns are added alongside existing plaintext columns
   (`users.phone_encrypted`, `users.email_encrypted`, `payments.metadata_encrypted`).
   Additive migration — no existing column dropped.
4. Application writes both columns; reads that require confidentiality use the
   decrypted value. Plaintext columns are deprecated.

## Key Management
The operator must set `app.encryption_key` in PostgreSQL before running the migration:
  ALTER SYSTEM SET app.encryption_key = '<base64-encoded-256-bit-key>';
  SELECT pg_reload_conf();
The key must be identical on every replica and node, or decryption silently fails.

## Consequences
- Plaintext never persists on disk for the encrypted columns.
- Defense in depth (Principle #15): even a full database dump exposes only ciphertext.
- Key rotation requires re-encrypting all `*_encrypted` values with the new key.

## References
- Principle #15 Proactive Defense — preventive encryption at rest.
- `migrations/0038_column_level_encryption.sql`
