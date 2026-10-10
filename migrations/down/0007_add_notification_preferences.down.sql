-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops notification_preferences. Every stored per-user preference falls back to the column defaults.
DROP INDEX IF EXISTS "idx_notification_preferences_user_id";
DROP TABLE IF EXISTS "notification_preferences";
