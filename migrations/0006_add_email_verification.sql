ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token varchar(255);
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token);
