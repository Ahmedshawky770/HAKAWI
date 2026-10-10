-- MFA/TOTP support for admin accounts.
--
-- WHY. The security architecture documents MFA as a gap (README: "MFA, account lockout: Not implemented").
-- Account lockout is now implemented (migration 0025). MFA is the remaining critical authentication gap.
-- Per Principle #2 (Principle of Least Privilege), admin accounts MUST have MFA enforced.
-- Per Principle #9 (Single Source of Truth), the MFA state lives on the user record, not in a separate table.
--
-- WHY TOTP (RFC 6238) AND NOT SMS/EMAIL. TOTP works offline, has no carrier dependency, and is the
-- industry standard for admin MFA. SMS is vulnerable to SIM swap; email MFA reduces to "access to
-- email = access to account" which defeats the purpose.
--
-- WHY OPTIONAL FOR NOW, MANDATORY FOR ADMINS. The `mfa_enabled` flag is nullable so existing users
-- aren't locked out. A separate migration (or admin action) will enforce it for accounts with
-- `admin_role IS NOT NULL`. The `totp_secret` is only set when MFA is enabled.
--
-- WHY ENCRYPTED SECRET. The TOTP secret is a credential equivalent to a password. It MUST NOT be
-- stored in plaintext. We reuse the existing `EncryptionService` (AES-256-GCM) which is already
-- used for password reset tokens.

-- Add MFA columns to users table
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "totp_secret_encrypted" text;

--> statement-breakpoint

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean DEFAULT false NOT NULL;

--> statement-breakpoint

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mfa_enforced_at" timestamp;

--> statement-breakpoint

-- Index for finding users with MFA enabled (for admin auditing)
CREATE INDEX IF NOT EXISTS "users_mfa_enabled_idx" ON "users" ("mfa_enabled");

--> statement-breakpoint

-- WHY NO BACKFILL. Existing users have no TOTP secret. They must enroll through the MFA setup
-- flow which generates a new secret and verifies the first code. This is the correct security
-- posture: you cannot retroactively assign a shared secret.