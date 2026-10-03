-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops follows, reactions, comments and comment_reactions together with every row in them.
DROP INDEX IF EXISTS "idx_comment_reactions_unique";
DROP INDEX IF EXISTS "idx_comment_reactions_comment_id";
DROP INDEX IF EXISTS "idx_comment_reactions_user_id";
DROP INDEX IF EXISTS "idx_comments_parent_id";
DROP INDEX IF EXISTS "idx_comments_author_id";
DROP INDEX IF EXISTS "idx_comments_story_id";
DROP INDEX IF EXISTS "idx_reactions_unique";
DROP INDEX IF EXISTS "idx_reactions_story_id";
DROP INDEX IF EXISTS "idx_reactions_user_id";
DROP INDEX IF EXISTS "idx_follows_unique";
DROP INDEX IF EXISTS "idx_follows_following_id";
DROP INDEX IF EXISTS "idx_follows_follower_id";
DROP TABLE IF EXISTS "comment_reactions";
DROP TABLE IF EXISTS "comments";
DROP TABLE IF EXISTS "reactions";
DROP TABLE IF EXISTS "follows";
