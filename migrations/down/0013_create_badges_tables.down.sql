-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops badges and user_badges. Every badge definition and every award already granted to a user is lost.
DROP INDEX IF EXISTS "user_badges_badge_id_idx";
DROP INDEX IF EXISTS "user_badges_user_id_idx";
DROP INDEX IF EXISTS "badges_name_idx";
DROP TABLE IF EXISTS "user_badges";
DROP TABLE IF EXISTS "badges";
