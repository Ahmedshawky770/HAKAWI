-- Add preferred_locale to users for localized notifications and UI defaults.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(5) NOT NULL DEFAULT 'ar';

-- Backfill existing rows (idempotent).
UPDATE users SET preferred_locale = 'ar' WHERE preferred_locale IS NULL;
