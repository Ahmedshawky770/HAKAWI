-- Migration 0033: Add admin_role_expires_at to users table for role expiry support
-- Principle #4: Document Problems and Solutions
-- Principle #12: Reduce Synchronization, Unify Source

ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role_expires_at timestamp with time zone;

CREATE INDEX users_admin_role_expires_at_idx ON users(admin_role_expires_at) WHERE admin_role_expires_at IS NOT NULL;