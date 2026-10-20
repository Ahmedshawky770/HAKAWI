-- Migration 0032: Create admin_role_assignments table for audit trail
-- Principle #4: Document Problems and Solutions
-- Principle #9: Single Source of Truth

CREATE TABLE admin_role_assignments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_role varchar(20) NOT NULL,
    assigned_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason text,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    revoked_at timestamp with time zone,
    revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
    revoke_reason text,
    environment varchar(20) NOT NULL DEFAULT current_setting('app.environment', true)
);

CREATE INDEX admin_role_assignments_user_id_idx ON admin_role_assignments(user_id);
CREATE INDEX admin_role_assignments_assigned_by_idx ON admin_role_assignments(assigned_by);
CREATE INDEX admin_role_assignments_assigned_at_idx ON admin_role_assignments(assigned_at DESC);
CREATE INDEX admin_role_assignments_active_idx ON admin_role_assignments(user_id, admin_role) WHERE revoked_at IS NULL;