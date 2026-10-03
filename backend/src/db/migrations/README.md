# Database migrations

The 16 hand-written numbered `.sql` files in the repository-level `migrations/` directory are
the **single source of truth** for schema history. `drizzle-kit` is no longer part of the
apply path: its journal (`migrations/meta/_journal.json`) recorded 3 of 16 files, so
`drizzle-kit up:pg` was a schema *push* that discarded the history entirely. It has been
removed from the npm workflow. `drizzle.config.ts` now points `out` at
`../migrations/drizzle-draft` so `db:studio` still works and nothing can accidentally write
into the applied history.

## Commands

| command | behaviour |
| --- | --- |
| `npm run migration:run` | apply every pending migration, one transaction per file |
| `npm run migration:run:staging` | alias of `migration:run` for the staging deploy gate |
| `npm run migration:run:production` | same, plus `--allow-production`; `NODE_ENV=production` is refused without it |
| `npm run migration:rollback` | roll back the newest migration (`--steps N`, `--to <id>`, `--allow-data-loss`) |
| `npm run migration:status` | applied vs pending, timing, reversibility, drift |
| `npm run migration:list` | filesystem view with checksums and reversibility |
| `npm run migration:verify` | ledger vs files against a live database; fails on drift |
| `npm run migration:create -- <name>` | scaffold `NNNN_name.sql` plus `down/NNNN_name.down.sql` |
| `npm run db:generate -- <name>` | same generator |
| `npm run db:check` | structural validation, no database needed (CI) |

`HAKAWI_MIGRATIONS_DIR` overrides the migrations directory. The runner locates it by
walking up from its own module path, so it works from `src/` and from `dist/`.

## Ledger

The ledger is the existing `drizzle_migrations` table, extended in place with
`filename`, `checksum`, `applied_at`, `execution_ms`, `statement_count` and
`rolled_back_at`. The table name and the `migration_id` convention (the file name without
`.sql`) are unchanged, so a database that already carries rows from the previous runner is
adopted rather than orphaned.

Per migration, inside the **same transaction** as the DDL:

- the file is split into statements by a real SQL tokenizer (string literals, dollar-quoted
  bodies, quoted identifiers, line and block comments, nested block comments). The tokenizer
  strips comments, so the `;` style and the `--> statement-breakpoint` style produce
  identical statements.
- every statement is executed, then the ledger row is upserted with the file name, the
  sha256 checksum, the duration and the statement count.

Because the ledger write is inside the transaction, a failure half way through a file leaves
**nothing** applied: no partial DDL and no ledger row.

## Checksum behaviour

`checksum` is the sha256 of the file content after CRLF/CR → LF normalization, trailing
whitespace trim, and a single final newline. Line-ending and trailing-whitespace
differences are therefore not drift; any other byte difference is.

- An already-applied file whose checksum no longer matches is a **hard error** on `up`,
  `down`, `status` and `verify`. Nothing is executed.
- A ledger row with no corresponding file on disk is a **hard error** (`orphan-ledger`).
- A migration applied out of order (a later sequence applied while an earlier one is still
  pending) is a **hard error**.
- A row written by the pre-checksum runner has an empty checksum. On the first run it is
  adopted from the file on disk and a warning is logged stating that the recorded checksum
  cannot be proven identical to what was executed. From then on it is drift-checked.
- A rolled-back row is kept with `rolled_back_at` set, so the audit trail survives; only
  rows with `rolled_back_at IS NULL` are treated as applied.

## Rollback reality

Rollback is driven by sidecar files in `migrations/down/NNNN_name.down.sql`. Each declares
its reversibility in a machine-read header:

```
-- hakawi:down reversibility=<reversible|data-loss|irreversible> data-loss=<none|columns|rows> reason=<one line>
```

- `reversible` — the down script restores the previous schema and destroys nothing. Runs
  without any flag.
- `data-loss` — drops columns or rows. `migration:rollback` **refuses** it unless
  `--allow-data-loss` is passed, and the refusal names the file, the loss class and the
  author's reason.
- `irreversible` — never runs. `migration:rollback` refuses unconditionally.

Current classification of the 16 historical migrations:

- `0001_create_stories_tables` is **irreversible**: it also creates the shared `uuid-ossp`
  extension, and dropping that cascades into the default of every `uuid_generate_v4()`
  column in the database, including tables it does not own.
- `0000`–`0013` and `0015`–`0016` are `data-loss`: they drop tables or columns. Reverse
  order is safe because every foreign key dependency was created in order, so rolling back
  N migrations in sequence removes the dependants first.
- `0014_create_search_indexes` is the only `reversible` migration: it drops three GIN
  indexes and touches no table data.

`migration:rollback` validates **every** target before executing the first statement, so a
refused batch never leaves the database half-rolled-back. `--to <id>` means "roll back until
`<id>` is the newest applied migration", so `<id>` itself stays applied.

## Adding a migration

```bash
npm run migration:create -- add_story_pinned
```

That writes `migrations/NNNN_add_story_pinned.sql` and
`migrations/down/NNNN_add_story_pinned.down.sql`. Write plain SQL in the forward file, fill
in the reversibility header in the down file, then:

```bash
npm run db:check          # structural validation, no database
npm run migration:run     # apply
npm run migration:verify  # checksum the database agrees with
```

An applied migration file is never edited. Every change goes into a new numbered file.
