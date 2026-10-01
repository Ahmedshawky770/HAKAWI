-- hakawi:down reversibility=irreversible data-loss=rows reason=Also creates the shared uuid-ossp extension. Dropping it would cascade into the default of every uuid_generate_v4() column in the database, including tables this migration does not own. Re-create the extension and the four tables with a forward migration instead.
DROP INDEX IF EXISTS "idx_story_tags_tag_id";
DROP INDEX IF EXISTS "idx_story_tags_story_id";
DROP INDEX IF EXISTS "idx_tags_slug";
DROP INDEX IF EXISTS "idx_categories_parent_id";
DROP INDEX IF EXISTS "idx_categories_slug";
DROP INDEX IF EXISTS "idx_stories_published_at";
DROP INDEX IF EXISTS "idx_stories_slug";
DROP INDEX IF EXISTS "idx_stories_category_id";
DROP INDEX IF EXISTS "idx_stories_status";
DROP INDEX IF EXISTS "idx_stories_author_id";
DROP TABLE IF EXISTS "story_tags";
DROP TABLE IF EXISTS "stories";
DROP TABLE IF EXISTS "tags";
DROP TABLE IF EXISTS "categories";
