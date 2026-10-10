-- hakawi:down reversibility=data-loss data-loss=rows reason=Restores the NOT NULL constraint on reporter_id. Any auto-filed report (source='auto') that has no reporter cannot be represented afterwards, so those rows must be deleted or re-attributed before this runs.
DROP INDEX IF EXISTS "reports_source_idx";
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_source_check";
ALTER TABLE "reports" DROP COLUMN IF EXISTS "source";
DELETE FROM "reports" WHERE "reporter_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "reporter_id" SET NOT NULL;
