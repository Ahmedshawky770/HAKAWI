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

The 17 entries now recorded here were generated from the real filenames. They exist for
readability only. Do not add a migration here first: run
`npm run migration:create -- <name>`, which writes the `.sql` file and its down script and
fails loudly if the numbering is wrong.
