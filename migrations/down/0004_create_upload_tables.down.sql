-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops the uploads table. The S3 objects it points at are not deleted, but every row describing them is.
DROP INDEX IF EXISTS "idx_uploads_story_id";
DROP INDEX IF EXISTS "idx_uploads_uploaded_by_id";
DROP INDEX IF EXISTS "idx_uploads_filename";
DROP TABLE IF EXISTS "uploads";
