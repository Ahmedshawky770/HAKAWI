-- Backfill NULL expires_at on admin_role_assignments so legacy "active forever"
-- rows get a concrete expiry (default 365 days from now). After this, isActive
-- can treat NULL as inactive safely.
UPDATE admin_role_assignments
SET expires_at = COALESCE(expires_at, now() + interval '365 days')
WHERE expires_at IS NULL;

--> statement-breakpoint

-- Same for users.admin_role_expires_at
UPDATE users
SET admin_role_expires_at = COALESCE(admin_role_expires_at, now() + interval '365 days')
WHERE admin_role IS NOT NULL AND admin_role_expires_at IS NULL;
