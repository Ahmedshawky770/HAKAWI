-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops reports, moderation_actions and user_restrictions. Active access restrictions issued to abusive accounts are lost, so the rollback must be reviewed by a moderator.
DROP INDEX IF EXISTS "idx_user_restrictions_type";
DROP INDEX IF EXISTS "idx_user_restrictions_user_id";
DROP INDEX IF EXISTS "idx_moderation_actions_target_user_id";
DROP INDEX IF EXISTS "idx_moderation_actions_admin_id";
DROP INDEX IF EXISTS "idx_moderation_actions_report_id";
DROP INDEX IF EXISTS "idx_reports_target_type";
DROP INDEX IF EXISTS "idx_reports_status";
DROP INDEX IF EXISTS "idx_reports_target_id";
DROP INDEX IF EXISTS "idx_reports_reporter_id";
DROP TABLE IF EXISTS "user_restrictions";
DROP TABLE IF EXISTS "moderation_actions";
DROP TABLE IF EXISTS "reports";
