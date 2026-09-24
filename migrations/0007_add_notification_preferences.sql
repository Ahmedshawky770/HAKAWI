CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_enabled boolean DEFAULT true NOT NULL,
  push_enabled boolean DEFAULT true NOT NULL,
  story_reactions boolean DEFAULT true NOT NULL,
  comments boolean DEFAULT true NOT NULL,
  follows boolean DEFAULT true NOT NULL,
  mentions boolean DEFAULT true NOT NULL,
  system boolean DEFAULT true NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);
