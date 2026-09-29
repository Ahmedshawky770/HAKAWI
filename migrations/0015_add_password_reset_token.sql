ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token varchar(255);
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token);
