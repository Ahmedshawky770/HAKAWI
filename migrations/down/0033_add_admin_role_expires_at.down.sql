-- hakawi:down reversibility=reversible data-loss=columns reason=Drops the admin_role_expires_at column, which holds the moment a temporary administrative role stops being in force. Losing it means the expiry dates are gone and every administrative grant becomes permanent, which is the state the column was added to leave.
DROP INDEX IF EXISTS users_admin_role_expires_at_idx;
--> statement-breakpoint
ALTER TABLE users DROP COLUMN IF EXISTS admin_role_expires_at;