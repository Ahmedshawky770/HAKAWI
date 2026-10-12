# `migrations/meta/`

This directory is a **drizzle-kit artifact, not the migration ledger**.

## What is authoritative

| what | where |
| --- | --- |
| migration files | `migrations/NNNN_snake_case_name.sql` |
| rollback scripts | `migrations/down/NNNN_snake_case_name.down.sql` |
| what has actually been applied | the `drizzle_migrations` table in the database |

`backend/src/db/migrations/migration-runner.ts` orders migrations by the `NNNN_` filename
prefix, checksums the file content, and records the result in `drizzle_migrations`. It does
**not** read this journal. `npm run migration:status` and `npm run migration:verify` are the
authoritative answers to "what has been applied".

## Why the journal exists

`drizzle.config.ts` now writes its output to `migrations/drizzle-draft/`, so drizzle-kit
keeps its own `meta/_journal.json` there and this file is never read by drizzle-kit either.
It is kept because deleting it would be a silent history edit, and because a reader who
opens `migrations/` should see an index that matches the files next to it.

It previously listed 3 entries (`0000_majestic_annihilus`, `0001_lucky_molly_hayes`,
`0002_nice_jigsaw`) against 16 hand-written files: the 13 hand-written migrations were
never in it. That mismatch is what made `drizzle-kit up:pg` dangerous — it is a schema
*push*, so it ignored every file in this directory and the ledger entirely. `db:push` has
been removed from `package.json` for that reason.

The 29 entries now recorded here were generated from the real filenames. They exist for
readability only. Do not add a migration here first: run
`npm run migration:create -- <name>`, which writes the `.sql` file and its down script and
fails loudly if the numbering is wrong.

> **This line said 17 until it was corrected, and the number 17 was wrong the moment the count
> changed.** The 17-entry paragraph described the journal as first regenerated from the real
> filenames; the section below records the same file at 29 entries, and both sentences claimed
> to describe the same artifact at the same time. A count in prose is a claim a reader cannot
> check without counting the entries themselves, so two counts in one README is the same
> failure the rest of the file is about: an index nobody reads drifting away from the things
> it indexes (Principle #9). Verified against the tree rather than against either sentence:
> `_journal.json` has 29 entries (`0000_create_users_table` … `0029_add_mfa_support`) and
> `migrations/` has 29 `.sql` files, and `scripts/check-migration-journal.mjs` now fails CI
> when those two numbers diverge. If this number disagrees with `ls migrations/*.sql | wc -l`,
> the count — not the file — is the thing to trust.

## The journal went stale again, and this time a deploy depended on it

`deploy-{dev,staging,production}.yml` ran `kubectl exec … npx drizzle-kit migrate`, which reads
**this** journal. It recorded 18 entries against 29 `.sql` files, so three deploys applied 18 of
29 migrations: `0029_add_mfa_support` (admin MFA/TOTP), the `0019`/`0025` books-owner backfills
and `0028`'s NOT NULL never reached a database. The runner never noticed, because it orders by
filename prefix and never opens this file — which is exactly how an index nobody reads rots.

Two things changed, and they are independent of each other:

1. The deploys no longer run drizzle-kit. They run the repo's own runner —
   `npm run migration:run:production --workspace=backend`, or the compiled
   `dist/db/migrations/migration-runner.js up --allow-production` inside the disposable
   migration job — which applies all 29 files under the sha256 ledger. drizzle-kit is not part
   of the apply path for the third time, and this README is the record of the first two.
2. The journal is now complete (29 entries, 0019–0029 filled in) and is checked on every pull
   request by `scripts/check-migration-journal.mjs`, which fails when the entry count differs
   from the number of `.sql` files or a tag does not resolve to one. An index that is read by
   nothing but asserted on by CI is an index that stays true.

`when` values for 0019–0029 are the commit timestamps of the files they describe, with a
millisecond offset per entry where several files share one commit. `idx` keeps drizzle's
counter semantics — it skips 17 because 0017 is a permanent hole — so the guard asserts
monotonicity and tag/file agreement, not contiguity.
