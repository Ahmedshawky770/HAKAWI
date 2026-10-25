-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops publisher_applications and publisher_writers. All publisher onboarding applications and publisher-writer relationships are lost.
DROP TABLE IF EXISTS "publisher_writers" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "publisher_applications" CASCADE;
