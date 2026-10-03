-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops categories, tags, stories and story_tags, destroying every row in them, so it requires --allow-data-loss. It was previously declared `irreversible`, and that was a misclassification rather than caution: the stated reason was entirely about the shared uuid-ossp extension, and this script never drops it. The hazard that reason described — dropping the extension cascading into the default of every uuid_generate_v4() column in the database, including tables this migration does not own — is already avoided by omission. What the script actually does is destroy rows, which is exactly the `data-loss` classification, and it is the only migration in the chain for which `assertReversible` refused unconditionally with no override: any rollback chain reaching 0001 failed entirely rather than requiring confirmation. Re-running 0001 forward after this rollback restores the schema, because it is written with CREATE EXTENSION IF NOT EXISTS and CREATE TABLE IF NOT EXISTS throughout.
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
