-- Add professional application fields to users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS professional_status VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS professional_video_path VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS professional_requested_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS professional_reviewed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS professional_rejection_reason TEXT;
