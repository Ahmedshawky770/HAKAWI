-- A prize you cannot put a number on.
--
-- WHY. `contest_prizes` carried `prize_type varchar(50)` and `prize_description text` only. The
-- roadmap marked "Prize distribution ✅" and `POST /contests/:id/prizes` writes the row — but a CASH
-- prize had nowhere to go. `prizeType` is a label ('cash', 'book', 'certificate') and
-- `prizeDescription` is prose, so the amount had to live inside a sentence that nothing can sum,
-- filter, or compare. "A prize was distributed" was recordable; "5000 EGP was distributed" was not.
--
-- WHY THE UNITS ARE EXPLICIT RATHER THAN INFERRED. The payments module sends amounts to Paymob in
-- piastres (1 EGP = 100) and `books.price` is an integer in the same unit, so this stores `amount`
-- in piastres and `currency` beside it rather than guessing a currency from a deployment default.
-- An amount with no currency is not an amount.
--
-- WHY NULLABLE AND NOT BACKFILLED. Existing rows have a prose description and no figure, and the
-- figure they described is not recoverable from it — parsing an English sentence for money is a
-- guess. They stay NULL, which reads as "a prize whose value was never recorded" rather than "zero",
-- which is the distinction that matters when someone reconciles a contest budget. A zero would look
-- like a prize that cost nothing.
--
-- WHY NOT FOLDED INTO THE EXISTING TABLE CREATION. Migration 0011 already created this table; this
-- is an additive change to a live table, which is the kind Principle #6 asks to keep separate and
-- name.

ALTER TABLE "contest_prizes"
  ADD COLUMN IF NOT EXISTS "amount" integer;

--> statement-breakpoint

ALTER TABLE "contest_prizes"
  ADD COLUMN IF NOT EXISTS "currency" varchar(3);

--> statement-breakpoint

-- Paired, not individually nullable: an amount with no currency, or a currency with no amount, is
-- the same class of half-recorded fact. `CHECK` rather than `NOT NULL` so a row with neither — which
-- is what every pre-existing row is — stays valid.
ALTER TABLE "contest_prizes"
  ADD CONSTRAINT "contest_prizes_amount_currency_paired"
  CHECK (
    ("amount" IS NULL AND "currency" IS NULL)
    OR ("amount" IS NOT NULL AND "currency" IS NOT NULL AND "amount" >= 0 AND char_length("currency") = 3)
  );

--> statement-breakpoint

-- Prize totals per contest is the query the missing column made impossible, so it gets the index
-- that supports it.
CREATE INDEX IF NOT EXISTS "contest_prizes_contest_amount_idx" ON "contest_prizes" ("contest_id", "amount");