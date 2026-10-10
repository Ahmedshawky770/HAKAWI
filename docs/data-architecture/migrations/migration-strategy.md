# Migration Strategy
## Hakawi Data Architecture

How database schema changes are created, verified, applied, and reversed.

Status markers: ✅ implemented · ⚠️ partial · ⛔ not implemented.

---

## System Overview

The migration system was **rebuilt** during 2026-09. The current system is:

- **22 numbered `.sql` files at the repository-root `migrations/` directory** are the single source
  of truth for schema.
- `backend/src/db/migrations/` holds the **runner** (discovery, checksum ledger, execution,
  rollback), not the migrations themselves.
- Every migration runs inside a **PostgreSQL transaction**, and every applied file is recorded in a
  **sha256 content-checksum ledger**. A file that changes after it has been applied is a hard
  error, not a silent re-run.
- Rollback is driven by **sidecar files** in `migrations/down/<id>.down.sql`, each carrying a
  machine-read reversibility header.

### ⛔ `drizzle-kit up:pg` is gone

The old workflow used `drizzle-kit up:pg`, a *schema push* that reconciles the database to the
Drizzle models and **discards migration history**. It is no longer available and must not be used.
`npm run db:generate` / `migration:create` **create a new numbered SQL file**; they do not push a
schema. Drizzle is now used as a **query builder and type layer only** (`backend/src/db/schema/*.ts`
mirrors the SQL; `drizzle-kit studio` remains available for browsing).

---

## The Migration Chain

`migrations/`, in order:

| # | File | Owns |
|---|---|---|
| 0000 | `0000_create_users_table.sql` | `users` (+ `user_restrictions`, `email_verification` columns) |
| 0001 | `0001_create_stories_tables.sql` | `stories`, `categories`, `tags`, `story_tags` — **and `uuid-ossp`** |
| 0002 | `0002_create_social_tables.sql` | `follows`, `reactions`, `comments`, `comment_reactions` |
| 0003 | `0003_create_messaging_tables.sql` | `notifications`, `conversations`, `messages`, `notification_preferences` |
| 0004 | `0004_create_upload_tables.sql` | `uploads` |
| 0005 | `0005_create_moderation_tables.sql` | `reports`, `moderation_actions`, `user_restrictions` |
| 0006 | `0006_add_email_verification.sql` | `users.email_verified`, `users.email_verification_token` |
| 0007 | `0007_add_notification_preferences.sql` | `notification_preferences` |
| 0008 | `0008_create_books_tables.sql` | `books`, `book_categories`, `book_tags`, `reading_progress` |
| 0009 | `0009_create_payments_tables.sql` | `payments`, `payment_transactions`, `refunds` |
| 0010 | `0010_create_rentals_tables.sql` | `rentals`, `rental_extensions` |
| 0011 | `0011_create_contests_tables.sql` | `contests`, `contest_submissions`, `contest_votes`, `contest_prizes` |
| 0012 | `0012_create_library_tables.sql` | `library` |
| 0013 | `0013_create_badges_tables.sql` | `badges`, `user_badges` |
| 0014 | `0014_create_search_indexes.sql` | three GIN full-text expression indexes |
| 0015 | `0015_add_password_reset_token.sql` | `users.password_reset_token` |
| 0016 | `0016_add_paymob_gateway_fields.sql` | `payments.paymob_payment_key` / `paymob_iframe_url` / `paymob_accept_url` |
| 0018 | `0018_add_report_source.sql` | `reports.source`, relaxes `reports.reporter_id` to nullable |

⚠️ **Known gap: there is no `0017`.** The numbering jumps from 16 to 18. `npm run db:check` reports
this as a warning (`sequence jumps from 16 to 18; a migration file is missing from the chain`,
`backend/scripts/check-migrations.ts:30`) and still exits 0. Either 0017 is a reserved slot that
needs filling, or the chain should be renumbered — the current state is deliberate-looking but
unexplained.

Total schema: **33 tables** across the chain, matching `backend/src/db/schema/*.ts` exactly.

---

## Commands

All commands run through `backend/src/db/migrations/migration-runner.ts` via `tsx`.

⛔ **Corrected — not every command forwards from the repo root.** This document previously stated
flatly that "from the repo root, `npm run <script>` forwards to the `backend` workspace". That is
true of only **five** scripts. The root `package.json` declares exactly `migration:run`,
`migration:status`, `migration:verify`, `db:check`, `seed:dev` and `seed:test`; every other name in
the table below lives only in `backend/package.json` and needs `--workspace=backend` when run from
the root. The "runs from the repo root" column below is measured against `package.json`, not assumed.

| Command | Root `package.json`? | What it does |
|---|---|---|
| `npm run migration:run` | ✅ yes | Apply every pending migration in order. Skips applied ones. Transaction-wrapped per migration. |
| `npm run migration:run:production` | ⛔ **no** — `backend` workspace only | Same, plus `--allow-production`. Required when `NODE_ENV=production`. |
| `npm run migration:run:staging` | ⛔ **no** — `backend` workspace only | Same as `migration:run` (a distinct name for pipeline clarity). |
| `npm run migration:rollback` | ⛔ **no** — `backend` workspace only | Roll back. Classification decides whether it is allowed. |
| `npm run migration:status` | ✅ yes | Table of every migration: `MIGRATION`, `STATE`, `APPLIED AT`, `MS`, `REVERSIBILITY`, `DETAIL`. |
| `npm run migration:list` | ⛔ **no** — `backend` workspace only | One line per file: id, first 12 chars of the checksum, reversibility, statement count. Works without a database. |
| `npm run migration:verify` | ✅ yes | Checksum-drift and orphan-ledger audit. Non-zero exit on drift. |
| `npm run db:check` | ✅ yes | **Static** migration-chain lint — no database required. |
| `npm run migration:create` | ⛔ **no** — `backend` workspace only | `tsx scripts/generate-migration.ts` — scaffolds the next numbered `.sql` and its `.down.sql`. |
| `npm run db:generate` | ⛔ **no** — `backend` workspace only | Alias of `migration:create`. |

Run the ⛔ rows as `npm run <script> --workspace=backend` from the root, or `cd backend` first.

### Flags

Parsed in `backend/src/db/migrations/migration-cli.ts`. Unknown flags are a hard error, and each flag
is rejected if used with the wrong command.

| Flag | Valid with | Meaning |
|---|---|---|
| `--steps <n>` | `down` | Roll back exactly `n` migrations. |
| `--to <id>` | `down` | Roll back until the named migration has been undone. |
| `--allow-data-loss` | `down` | Required to run a `data-loss` down script. |
| `--allow-production` | `up` | Required when `NODE_ENV=production`. |

`--steps` and `--to` are mutually exclusive. `--allow-data-loss` on anything but `down` is an
error, as is `--allow-production` on anything but `up`.

`--allow-production` exists so that a production migration is an explicit decision rather than an
accident:

```
Refusing to run migrations with NODE_ENV=production without --allow-production.
Use "npm run migration:run:production", which passes the flag, so a production deploy
is an explicit decision.
```

### CI wiring
`.github/workflows/ci.yml` runs two migration jobs:
- `migration-premerge` → `npm run db:check` (no database)
- `migration-verify` → applies migrations, then `npm run migration:verify` against the resulting
  ledger

---

## Reversibility Model

Every rollback is driven by `migrations/down/<id>.down.sql`. The first line is a machine-read
header; the runner parses it and refuses to proceed on a missing or unparseable header.

```
-- hakawi:down reversibility=<reversible|data-loss|irreversible> data-loss=<none|rows|columns> reason=<human explanation>
```

### The three classifications

| Classification | Runner behaviour | Real examples |
|---|---|---|
| `reversible` | Runs. No extra flag. | `0014_create_search_indexes` — drops three GIN indexes, touches no rows. |
| `data-loss` | **Refuses** without `--allow-data-loss`. The `reason` must say what is destroyed. | `0009_create_payments_tables` (the money ledger), `0000_create_users_table` (every user row), `0018_add_report_source` (re-tightens `NOT NULL` on `reporter_id`). |
| `irreversible` | **Never runs.** Throws `MigrationNotReversibleError` regardless of any flag. | ⛔ **None.** No migration in the chain uses this classification today (see the distribution below). The runner still supports it. |

### ⛔ There is no `irreversible` migration, and `0001` is not one

⛔ **Corrected.** This section previously argued that `0001_create_stories_tables` is
`irreversible` **because it creates the shared `uuid-ossp` extension**, and quoted a
`reversibility=irreversible` header that no longer exists. The measured distribution across all 22
down scripts is **0 `irreversible`, 18 `data-loss`, 4 `reversible`**.

`migrations/down/0001_create_stories_tables.down.sql:1` now reads
`reversibility=data-loss data-loss=rows`, and its own reason records that the script **never drops
the extension**. The hazard the old text described — dropping `uuid-ossp` cascading into the default
of every `uuid_generate_v4()` column in the database, including tables this migration does not own —
is therefore already avoided, by omission rather than by a refusal.

What the script actually does is 14 executable `DROP` statements over `story_tags`, `stories`,
`tags` and `categories`, destroying every row in them. That is `data-loss`, and it now requires
`--allow-data-loss` like every other destructive step. It was the **only** migration in the chain
that `assertReversible` refused unconditionally, so a rollback chain reaching `0001` previously
failed outright instead of asking; that is no longer true.

The response to a bad `0001` remains a **forward** migration where a rollback would destroy data —
that is what Principle #6 ("minimize database migrations", "data loss is irreversible") means. What
was wrong was calling the classification itself `irreversible`. Re-running `0001` forward after a
rollback restores the schema, because it is written with `CREATE EXTENSION IF NOT EXISTS` and
`CREATE TABLE IF NOT EXISTS` throughout.

### Writing a new down script

```sql
-- migrations/down/00NN_your_change.down.sql
-- hakawi:down reversibility=data-loss data-loss=columns reason=Drops the foo column. Rows keep
-- their bar value, so the feature can be re-added with a forward migration.
ALTER TABLE "things" DROP COLUMN IF EXISTS "foo";
```

Rules the runner enforces:
- The header must be the first line and must parse.
- A `down` script declared reversible must contain at least one executable statement, otherwise
  `MigrationNotReversibleError` is raised (`:242`).
- A `data-loss` script run without `--allow-data-loss` names the `data-loss` kind and the reason in
  the error (`:205-211`).

---

## Ledger, Drift, and Idempotency

### Checksum ledger
Each applied migration is stored with a **sha256 of the file content**. On every `up` and on
`verify`:
- A file whose hash differs from the recorded hash → `MigrationChecksumMismatchError`, hard fail.
  Editing an applied migration is forbidden.
- A ledger row with no matching file → `MigrationLedgerDriftError` (orphan), reported by `verify`.
- A file with no ledger row and already-present schema → applied normally (idempotent by design
  only through the ledger, not by `IF EXISTS` guesswork).

### Legacy rows
Rows written before the runner recorded checksums carry the sentinel `LEGACY_CHECKSUM = ''`
(`backend/src/db/migrations/migration-runner.ts:41`). On first encounter the runner **adopts** the current file hash and logs
that it cannot prove the executed content matches:

> `Migration 0000 was applied before this runner recorded checksums, so its recorded checksum was
> adopted from the current file (…) and cannot be proven identical to what was executed.`

This is honest about the limit rather than pretending the old rows are verified.

### Transaction wrapping
Each migration is applied inside `this.database.transaction(...)` (`:218`, `:247`), so a partially
applied statement set cannot be committed.

### Idempotency
`migration:run` is safe to re-run: already-applied files are skipped and reported as `skipped=`.
`migration:status` and `migration:list` are read-only; `list` needs no database at all.

---

## Workflow

### 1. Create
```bash
npm run migration:create -- add_user_preferences
# or: npm run db:generate -- add_user_preferences
```
Scaffolds `migrations/00NN_add_user_preferences.sql` and
`migrations/down/00NN_add_user_preferences.down.sql` with a starter reversibility header.

### 2. Write the SQL
Plain SQL. No TypeScript, no `export async function up(db: any)`.

> **Replaced.** This document previously showed a `YYYYMMDDHHMMSS_name.ts` file exporting
> `up(db: any)` / `down(db: any)`. That format never existed in this repository, and it violates
> the project's own zero-`any` rule (`@typescript-eslint/no-explicit-any: 'error'` in
> `backend/.eslintrc.cjs`). Migrations are `.sql`; the runner is TypeScript.

### 3. Lint the chain
```bash
npm run db:check
```
Detects sequence gaps, missing `.down.sql` sidecars, unparseable reversibility headers, and
duplicate ids. No database required — this is the pre-merge gate.

### 4. Apply and verify
```bash
npm run migration:run
npm run migration:status
npm run migration:verify
```

### 5. Test the rollback
```bash
# from the repo root, migration:rollback is a backend-workspace script:
npm run migration:rollback --workspace=backend -- --to 0015        # back to before 0016
npm run migration:rollback --workspace=backend -- --steps 1        # undo one
# if the target is classified data-loss (18 of the 22 down scripts are):
npm run migration:rollback --workspace=backend -- --steps 1 --allow-data-loss
```

### 6. Deploy
```bash
npm run migration:run:staging
npm run migration:run:production      # passes --allow-production
```

### 7. Post-deployment
```bash
npm run migration:verify
```

---

## Rollback Strategies

### Additive changes (add a nullable column, add a table)
`reversible`. No flag, no data loss.

### Column removals and constraint tightenings
`data-loss` — even when the loss is "just" a column, because an in-flight value may exist. These
need `--allow-data-loss` and a `reason` that names what is lost.

### Table and extension removals
`data-loss` when rows are destroyed, `reversible` when only indexes or empty columns are dropped.

⛔ **Corrected:** this section previously prescribed `irreversible` "where a shared object is
involved (the `uuid-ossp` case)". No migration uses `irreversible`, and the `uuid-ossp` case was a
misapplication of the rule — `0001` creates the extension and its down script never drops it, so
nothing about the extension is at stake in the rollback. Reserve `irreversible` for a step that
genuinely cannot be undone (an external side effect, a dropped extension that other objects
depend on); it should be a rare, deliberate choice, not the default answer for "this destroys
rows".

### Data migrations — the two-phase pattern
Still the right approach, and the reversibility header is where it is recorded:
1. Add the new nullable column
2. Backfill
3. Deploy code that reads the new column
4. In a **separate, later** migration, drop the old column — classified `data-loss`

---

## Emergency Procedures

### Migration failure mid-apply
1. The transaction aborts; the database is left at the previous migration. Nothing is half-applied.
2. `npm run migration:status` shows exactly which file failed.
3. Fix the file. Because the failed file was never recorded in the ledger, its checksum is not
   pinned and it can be edited freely.
4. Re-run `npm run migration:run`.
5. If the failure is a checksum error on an *already applied* file, the file was edited after the
   fact: restore it, or write a new forward migration.

### Production issue caused by a migration
1. Stop the deploy pipeline.
2. Assess data integrity (`npm run migration:status`, ledger contents).
3. Roll back **only if** the down script is `reversible` or you accept `data-loss` and pass
   `--allow-data-loss`. An `irreversible` migration can only be fixed forward.
4. Deploy the previous code (`git revert`).
5. Post-mortem; write a forward migration.

### ⛔ Not implemented
- ⛔ **Automated backups.** There is no backup job, no `pg_dump` cron, and no PITR configuration in
  the repository. `docs/deployment/backup.md` describes an `nginx.conf` and a `scripts/` directory
  that do not exist. Restoring from a backup is currently a manual operation against a snapshot you
  must already have.
- ⛔ **Maintenance mode.** Nothing pauses traffic during a migration.
- ⛔ **Zero-downtime column drops.** Principle #6 asks for additive-only changes; the runner does not
  enforce it, the reversibility header just records the risk.

---

## Best Practices

1. **Small migrations** — one concern per file, so a rollback is one concern wide.
2. **Never edit an applied file.** The checksum ledger turns this from a convention into an error.
3. **Always write the down sidecar with a real `reason`.** The reason is the only thing a reviewer
   reads when deciding whether to pass `--allow-data-loss`.
4. **Classify honestly.** Marking a destructive down script `reversible` to avoid a flag is a lie
   that a reviewer has to catch; the ledger cannot.
5. **Test the rollback on staging before merging.**
6. **Run `npm run db:check` before review** — it needs no database and catches most mistakes.
7. **Add nullable first, backfill, then require** — and drop the old column in a *later* migration.

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality | Evidence |
|---|---|---|
| Migrations in `backend/src/migrations/`, named `YYYYMMDDHHMMSS_*.ts` | **22** numbered `.sql` files at the **repository-root** `migrations/`; no timestamp format | `migrations/`, `backend/src/db/migrations/migration-discovery.ts` |
| `export async function up(db: any)` / `down(db: any)` | Never existed, and violates the zero-`any` rule | `backend/.eslintrc.cjs` sets `no-explicit-any: 'error'` |
| Drizzle-generated migrations | `drizzle-kit up:pg` **removed** — it was a schema push that discarded history. `migration:create` now scaffolds SQL. | no `drizzle.config.ts` push target; `backend/scripts/generate-migration.ts` |
| `npm run migration:rollback` "documented but did not exist" | ✅ Now real, with `--steps`, `--to`, `--allow-data-loss` | `backend/package.json`, `migration-cli.ts` |
| No `--status` / `--list` | ✅ Both real; `list` runs without a database | `migration-runner.ts:404,435` |
| No content-checksum ledger | ✅ sha256 ledger, drift is a hard error | `migration-runner.ts:153,296` |
| Rollback "tested before deployment" (unimplemented) | ✅ machine-read reversibility headers with 3 classifications | `migrations/down/*.down.sql` first line |
| 17 migrations | **18** files, with a gap at 0017 | `migrations/` listing |
| — | New: `migrations/meta/` ledger-support directory | `migrations/meta` |
| Backup/restore as part of rollback | ⛔ No backup automation exists | no backup script or cron in the repo |
| Zero-downtime enforcement | ⚠️ Aspiration only; the runner records risk, it does not prevent it | — |

**Newly documented (was missing entirely):** the classification policy, the four flags, the
transaction and checksum guarantees, and the legacy-checksum adoption behaviour.

⛔ **Retracted from the same list:** "the reason `0001_create_stories_tables` is deliberately
irreversible". It is `data-loss`, and the reason has been corrected above.

---

*This document defines the migration strategy for Hakawi.*
