-- hakawi:down reversibility=data-loss data-loss=rows reason=Restores the pre-backfill counter values, which are not recoverable from the data. The old values were wrong — the columns were never written, so they read 0 for every story and only ever climbed for a comment's reply count — and this script reconstructs them as 0 rather than as the true previous number, because the true previous number was never stored anywhere. Re-running the forward migration recomputes the correct values.
--
-- WHY `data-loss` RATHER THAN `irreversible`. The previous values are not knowable, so a rollback
-- cannot be faithful; but nothing is destroyed that was correct, and the forward migration is
-- idempotent, so the change is safely repeatable in the other direction. `irreversible` would
-- block a rollback chain that reaches this migration for no benefit, which is the state `0001` was
-- in before it was reclassified.
--
-- WHY EVERY COUNTER RETURNS TO 0. That is what the columns held before: `stories.like_count` and
-- `stories.comment_count` had no writer at all and read 0 for every row; `comments.like_count` had
-- no writer either; `comments.reply_count` was incremented on reply creation and never decremented,
-- so its pre-migration value is 0 for a comment with no replies and unknowable for one with
-- replies. Returning all four to 0 reproduces the observable pre-migration state for the first
-- three exactly, and for the fourth reproduces it for every comment that has no live replies.
UPDATE stories SET like_count = 0;
--> statement-breakpoint
UPDATE stories SET comment_count = 0;
--> statement-breakpoint
UPDATE comments SET like_count = 0;
--> statement-breakpoint
UPDATE comments SET reply_count = 0;
