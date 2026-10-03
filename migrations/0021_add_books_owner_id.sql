-- Give `books` a real owner.
--
-- WHY. `books.author` is `varchar(255)` — a DISPLAY NAME, not an identity — and there was no
-- `user_id` column at all. Four write paths in `BooksService` guarded with
-- `if (book.author !== userId)`, comparing a display name against a UUID:
--
--   books.service.ts:178  update()    `book.author !== userId` -> ForbiddenException
--   books.service.ts:211  publish()   `book.author !== userId` -> ForbiddenException
--   books.service.ts:259  purchase()  `book.author === userId`  -> ForbiddenException ("own book")
--   books.service.ts:274  rent()      `book.author !== userId` -> ForbiddenException
--
-- A name is never equal to a UUID, so every one of those guards failed for EVERY caller. No book could
-- be updated, published, archived or deleted, and nobody could be stopped from buying their own book.
-- The unit tests passed because their fixtures used `author: 'user-1'` — a UUID-shaped string in a
-- varchar column, a shape the schema cannot produce.
--
-- WHY `owner_id` IS NULLABLE AND IS NOT BACKFILLED. `owner_id` cannot be derived from `author`:
-- `author` is a free-text name, `users` has no unique name column, and matching one to the other is a
-- guess. Guessing here would silently hand a book to the wrong account — an ownership transfer with no
-- audit trail, which is worse than the NULL it replaces (Principle #9: one authoritative source, and a
-- wrong value in it is worse than a missing one). Pre-existing books therefore have `owner_id IS NULL`
-- and must be claimed by an administrator through `PATCH /books/:id`. Every write path treats a NULL
-- owner as unowned rather than as owned-by-nobody, so those rows stay editable by an admin and are
-- editable by NOBODY else — a loud, correct state rather than a silent one.
--
-- WHY NOT A PARTIAL UNIQUE INDEX OR A TRIGGER. The column needs a plain foreign key and an index; a
-- trigger to auto-populate it from `author` would encode the guess this migration deliberately refuses
-- to make.
--
-- BACKFILL HOOK, LEFT IN PLACE FOR AN OPERATOR. The statements below are commented out on purpose.
-- They are the thing an operator runs ONCE, by hand, after reading the candidate pairs, because the
-- decision of which user owns which pre-existing book is editorial. Run the SELECT first and read the
-- output; if a name matches exactly one user, uncomment the UPDATE with that pairing spelled out.
-- Do NOT run it blind: it matches on `users.name`, which is not unique, so a name shared by two
-- accounts would assign every book by that author to both.
--
--   -- 1. See what would be claimed. Read this output before changing anything.
--   SELECT b.id, b.title, b.author, u.id AS candidate_user_id, u.name, u.email
--   FROM books b
--   JOIN users u ON u.name = b.author
--   WHERE b.owner_id IS NULL
--   ORDER BY b.author, u.email;
--
--   -- 2. Claim, ONLY for pairs you have checked. Spell the ids out; never match on name alone.
--   -- UPDATE books SET owner_id = '<user uuid>'::uuid WHERE id = '<book uuid>'::uuid;

ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "users"("id");

--> statement-breakpoint

-- The guard on the write path. Without it every ownership check is a sequential scan.
CREATE INDEX IF NOT EXISTS "books_owner_id_idx" ON "books" ("owner_id");

--> statement-breakpoint

-- WHY NOT `SET NOT NULL` HERE. It would fail on any database holding a single pre-existing book, and
-- the only way to satisfy it is the name-matching guess documented above. The application enforces the
-- invariant instead: `CreateBookDto` requires the owner to be the authenticated caller, so a row
-- created through the API can never have a NULL owner. The column becomes NOT NULL when the backfill
-- above has been completed on every environment — at which point it is a separate, data-only migration
-- rather than something this one has to guess at.