-- hakawi:down reversibility=reversible data-loss=none reason=Drops the contest_prizes.amount column, its currency column, the pairing CHECK and the index. No row loses data: amount and currency are added by this migration and no earlier code wrote them, so the prior state is exactly the absence of these columns. Any figure recorded since the migration was applied has to be re-entered, which is the one cost of a rollback here.
DROP INDEX IF EXISTS "contest_prizes_contest_amount_idx";
--> statement-breakpoint
ALTER TABLE "contest_prizes" DROP CONSTRAINT IF EXISTS "contest_prizes_amount_currency_paired";
--> statement-breakpoint
ALTER TABLE "contest_prizes" DROP COLUMN IF EXISTS "amount";
--> statement-breakpoint
ALTER TABLE "contest_prizes" DROP COLUMN IF EXISTS "currency";