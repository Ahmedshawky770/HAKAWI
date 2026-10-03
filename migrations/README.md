# `migrations/`

The applied migration history. One file per forward migration, named `NNNN_snake_case_name.sql`,
ordered and applied by `backend/src/db/migrations/migration-runner.ts` under a sha256 content-checksum
ledger. The runner is the contract; see `backend/src/db/migrations/README.md` for its own side.

| where | what |
| --- | --- |
| `NNNN_*.sql` | the forward migration. Tracked, and the single source of truth for the schema. |
| `down/NNNN_*.down.sql` | the rollback script. Its first line declares `reversibility`, `data-loss` and a reason; `npm run db:check` rejects a missing script, an unreplaced placeholder, or a classification with an empty body. |
| `meta/` | a drizzle-kit artefact, **not** the ledger. Nothing in the runner reads it. See `meta/README.md`. |

## `0017` is a permanent hole. Do not fill it.

The numbering runs `0000`–`0016` and then **`0018`**. There is no `0017`.

`npm run migration:create -- <name>` allocates `max(sequence) + 1`
(`backend/scripts/generate-migration.ts`), so the next migration is **`0020`** and `0017` can never be
handed out again. `npm run db:check` reports the hole as a **warning** and still exits 0, so the CI job
`migration-premerge` will not stop you.

What the hole forbids is **back-filling it by hand**. `assertNoDrift` in `migration-runner.ts`
requires the applied migrations to form a prefix of the file order, so a hand-written `0017` sitting
between an applied `0016` and an applied `0018` would be a pending file *below* the last applied one —
and `npm run migration:run` would then refuse to apply anything, permanently, until it was removed.
The regression tests for exactly this are named `"SANDWICHED"` and `"clean prefix"` in
`migration-runner.spec.ts`.

It is also not worth closing. Renumbering `0018` to `0017` would change the content of a file that has
already been applied on some machine, which is a sha256 mismatch, not a cleanup.

Write the next number. Leave `0017` alone.

## Migrations that refuse to apply

Two migrations check their data and stop rather than guess. Both name the offending rows, because the
resolution is a per-row decision an operator has to make:

| migration | refuses when | why |
| --- | --- | --- |
| `0019_backfill_denormalised_counters` | — | always applies; re-counts from the source tables, so it is idempotent. |
| `0020_add_stories_slug_unique` | two stories already share a `slug` | `stories.category_id`-style references and inbound links may point at either row. Picking a survivor would be a silent rewrite of a published URL, which is worse than a failed deploy. |

Check before deploying: `npm run migration:status`.

## Rollback

`npm run migration:rollback -- --to 0004`, or `--steps N`. A `data-loss` script requires
`--allow-data-loss`; an `irreversible` one is refused outright with no override, because there is no
flag that can reconstruct destroyed data.

`0001` is declared `irreversible` — it also creates the shared `uuid-ossp` extension, and dropping that
would cascade into the default of every `uuid_generate_v4()` column in the database, including tables
that migration does not own. A rollback chain that reaches `0001` therefore fails, by design. Its down
script still carries 14 executable statements for the four tables it created, which is why the
declaration is worth reading before assuming a chain will reach the bottom.
