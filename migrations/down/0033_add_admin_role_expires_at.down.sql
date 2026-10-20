-- Migration 0033 down: Remove admin_role_expires_at from users table

DROP INDEX IF EXISTS users_admin_role_expires_at_idx;
ALTER TABLE users DROP COLUMN IF EXISTS admin_role_expires_at;