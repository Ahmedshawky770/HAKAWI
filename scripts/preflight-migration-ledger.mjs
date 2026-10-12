#!/usr/bin/env node
/**
 * WHY THIS SCRIPT EXISTS.
 *
 * Two different tools have applied migrations in this repository's databases, and they
 * keep their books in two different tables:
 *
 *   | tool                          | table                       |
 *   | ----------------------------- | --------------------------- |
 *   | `backend/src/db/migrations/`  | `drizzle_migrations`        |  <- the repo's runner ledger
 *   | drizzle-kit `migrate`         | `__drizzle_migrations`      |  <- drizzle-kit's own journal
 *
 * `migrations/meta/README.md` records the history: the deploy workflows ran
 * `npx drizzle-kit migrate`, which reads `migrations/meta/_journal.json` and stopped at
 * `0018_add_report_source` — 18 of 29 files. `0019`–`0029` (MFA, the books-owner backfills,
 * the enums) never reached a database. The workflows now run the repository's own runner,
 * which orders by filename and IGNORES drizzle-kit's journal entirely.
 *
 * That is correct, and it is also the hazard: on an environment that was previously
 * migrated by drizzle-kit, the runner sees an EMPTY (or short) `drizzle_migrations` ledger
 * and re-applies `0019`–`0029` from scratch. `migrations/0018_add_report_source.sql` ends
 * with an UNGUARDED `ALTER TABLE "reports" ADD CONSTRAINT "reports_source_check"`, so the
 * re-apply of `0018` dies with `42710 duplicate_object` — after the rollout has already
 * started, with the new image live and the schema half-migrated.
 *
 * So this script is the assertion that runs BEFORE the migration job: if drizzle-kit has
 * applied migrations the runner's ledger does not know about, the ledgers DISAGREE, and
 * applying is unsafe. It fails with the remediation instead of letting the job fail
 * mid-rollout. It is read-only: two `count(*)` queries, no DDL, no writes, no lock.
 *
 * ENVIRONMENT CONTRACT — mirror of the migration Job in the deploy workflows
 * (`.github/workflows/deploy-{dev,staging,production}.yml`), which inherits the backend
 * Deployment's connection configuration:
 *
 *   DB_PRIMARY_HOST / DB_PRIMARY_PORT / DB_PRIMARY_NAME / DB_PRIMARY_USER / DB_PRIMARY_PASSWORD
 *   ... with DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD as the fallback, exactly as
 *   `backend/src/db/router.ts` resolves them (`DB_PRIMARY_*` first, `DB_*` second).
 *   `DATABASE_URL` (or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD) is accepted as well so
 *   the script can be pointed at any postgres without a full env block.
 *
 * EXIT CODES
 *   0  ledgers agree (or the database has no migration tables yet — a fresh environment),
 *      after printing a one-line summary.
 *   1  ledgers disagree: drizzle-kit has applied migrations the runner's ledger lacks.
 *      The deploy must stop; the remediation is printed.
 *   2  the database is unreachable, misconfigured, or a query failed. NOT a crash: no
 *      stack trace, a single actionable message.
 *
 * Run it from anywhere — paths are resolved from this file, not from the cwd:
 *
 *   node scripts/preflight-migration-ledger.mjs
 *   DB_PRIMARY_HOST=... DB_USER=... PGPASSWORD=... node scripts/preflight-migration-ledger.mjs
 */
import { Client } from 'pg';

const DRIZZLE_TABLE = '__drizzle_migrations';
const LEDGER_TABLE = 'drizzle_migrations';

const CONNECT_TIMEOUT_MS = 5000;

/** Read the first non-empty of the given environment variables. */
function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
}

function remapEnv(from, to) {
  const value = process.env[from];
  if (value !== undefined && value !== '' && process.env[to] === undefined) {
    process.env[to] = value;
  }
}

/**
 * Normalise the connection configuration into the shape `pg` understands.
 *
 * WHY the remapping exists: libpq-style variables (PGHOST, PGPORT, PGDATABASE, PGUSER,
 * PGPASSWORD) are read by `pg` automatically, so a caller can set only those. DB_* and
 * DB_PRIMARY_* are NOT libpq names and would be ignored silently — which is the failure
 * this function prevents, because a silently-ignored host is a connection to localhost.
 */
function resolveConnection() {
  const url = firstEnv('DATABASE_URL', 'MIGRATION_DATABASE_URL');
  const host = firstEnv('DB_PRIMARY_HOST', 'DB_HOST', 'PGHOST');
  const port = firstEnv('DB_PRIMARY_PORT', 'DB_PORT', 'PGPORT');
  const database = firstEnv('DB_PRIMARY_NAME', 'DB_NAME', 'PGDATABASE');
  const user = firstEnv('DB_PRIMARY_USER', 'DB_USER', 'PGUSER');
  const password = firstEnv('DB_PRIMARY_PASSWORD', 'DB_PASSWORD', 'PGPASSWORD');

  if (url === undefined && host === undefined) {
    return {
      error:
        'No database configuration found. Set DB_PRIMARY_HOST (or DB_HOST / PGHOST, or DATABASE_URL) ' +
        'plus DB_USER and DB_PASSWORD (or PGPASSWORD) — the same variables the migration Job gets ' +
        'from the release ConfigMap and ExternalSecret.',
    };
  }

  const connection = {
    host: host ?? 'localhost',
    port: port === undefined ? 5432 : Number.parseInt(port, 10),
    database: database ?? 'hakawi',
    user: user ?? 'postgres',
    password: password ?? '',
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  };

  if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535) {
    return { error: `DB_PRIMARY_PORT must be an integer between 1 and 65535; got "${port}".` };
  }

  return { connection, url };
}

function toRegClassSql(table) {
  return `SELECT to_regclass('public.${table}') IS NOT NULL AS present`;
}

async function countTable(client, table) {
  const exists = await client.query(toRegClassSql(table));
  if (exists.rows[0].present !== true) {
    return null;
  }
  // `rolled_back_at IS NULL` only exists on the runner's ledger; drizzle-kit's journal has
  // no such column, so the predicate is added per table rather than shared.
  const where = table === LEDGER_TABLE ? ' WHERE rolled_back_at IS NULL' : '';
  const counted = await client.query(`SELECT count(*)::int AS n FROM ${table}${where}`);
  return counted.rows[0].n;
}

async function readLedgerMigrationIds(client) {
  const exists = await client.query(toRegClassSql(LEDGER_TABLE));
  if (exists.rows[0].present !== true) {
    return [];
  }
  const rows = await client.query(
    `SELECT migration_id FROM ${LEDGER_TABLE} WHERE rolled_back_at IS NULL ORDER BY migration_id`,
  );
  return rows.rows.map((row) => row.migration_id);
}

function printRemediation() {
  const lines = [
    '',
    'REMEDIATION (pick one, then re-run this script):',
    '',
    '  A. BACKFILL THE LEDGER — recommended for an environment whose schema is known good.',
    '     For every migration drizzle-kit already applied, insert a row into `drizzle_migrations`',
    '     so the runner stops re-applying it. `migration_id` is the file name without `.sql`,',
    '     `filename` is the same value, and `checksum` is the sha256 of the file content after',
    '     CRLF/CR -> LF normalisation and a trailing-whitespace trim',
    '     (`backend/src/db/migrations/migration-checksum.ts`). A wrong checksum is a hard error',
    '     on `verify`, so copy it from the runner rather than guessing:',
    '',
    '       INSERT INTO drizzle_migrations (migration_id, filename, checksum, applied_at)',
    "       VALUES ('0018_add_report_source', '0018_add_report_source', '<sha256>', NOW())",
    '       ON CONFLICT (migration_id) DO NOTHING;',
    '',
    '     Then confirm with `npm run migration:status --workspace=backend` (or',
    '     `node dist/db/migrations/migration-runner.js status` inside the cluster).',
    '',
    '  B. DISCARD AND RECREATE — for a throwaway environment (dev is the usual case).',
    '     Drop the schema and let the migration job apply the full chain from an empty ledger.',
    '',
    '  C. DO NOT do the tempting thing: running the migration job anyway. It re-applies 0019-0029',
    '     and dies on the UNGUARDED `ALTER TABLE "reports" ADD CONSTRAINT "reports_source_check"`',
    '     at migrations/0018_add_report_source.sql, after the rollout has already started.',
    '',
  ];
  console.log(lines.join('\n'));
}

function fail(code, message) {
  console.error('');
  console.error(`::error::${message}`);
  console.error('');
  process.exitCode = code;
}

async function main() {
  const resolved = resolveConnection();
  if (resolved.error !== undefined) {
    fail(2, `Migration ledger preflight: ${resolved.error}`);
    return;
  }

  // libpq-style names are consumed by `pg` only when they are NOT contradicted by explicit
  // options, so a caller who set PGPASSWORD only is enough.
  remapEnv('DB_PASSWORD', 'PGPASSWORD');

  const client = new Client(resolved.url !== undefined ? { connectionString: resolved.url } : resolved.connection);

  let drizzleCount;
  let ledgerCount;
  let ledgerIds;
  try {
    await client.connect();
  } catch (error) {
    const target = resolved.url !== undefined ? 'DATABASE_URL' : `${resolved.connection.host}:${resolved.connection.port}`;
    const reason = error instanceof Error ? error.message : String(error);
    fail(
      2,
      `Migration ledger preflight could not reach the database at ${target} ` +
        `(${reason}). This check is database-only and read-only; the migration Job would fail the same ` +
        `way, but after the rollout. Fix connectivity (or supply the credentials the Job uses: ` +
        `DB_USER/DB_PASSWORD plus DB_PRIMARY_HOST) and re-run.`,
    );
    return;
  }

  try {
    drizzleCount = await countTable(client, DRIZZLE_TABLE);
    ledgerCount = await countTable(client, LEDGER_TABLE);
    ledgerIds = await readLedgerMigrationIds(client);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fail(2, `Migration ledger preflight failed while reading the ledger tables: ${reason}`);
    return;
  } finally {
    await client.end().catch(() => undefined);
  }

  const drizzleLabel = drizzleCount === null ? 'table absent' : `${drizzleCount} row(s)`;
  const ledgerLabel = ledgerCount === null ? 'table absent' : `${ledgerCount} row(s)`;
  console.log(
    `Migration ledger preflight: drizzle-kit journal ${DRIZZLE_TABLE} = ${drizzleLabel}; ` +
      `runner ledger ${LEDGER_TABLE} = ${ledgerLabel}.`,
  );

  if (drizzleCount === null && ledgerCount === null) {
    console.log(
      'Neither migration table exists yet: this is a fresh environment, so there is nothing for the ' +
        'runner to re-apply. The migration job will apply the full chain.',
    );
    return;
  }

  if (drizzleCount === null) {
    console.log(
      'No drizzle-kit journal in this database: every applied migration came from the repository runner, ' +
        'so its ledger is the whole history.',
    );
    return;
  }

  if (ledgerCount === null) {
    fail(
      1,
      `${DRIZZLE_TABLE} holds ${drizzleCount} applied migration(s) but the runner ledger ${LEDGER_TABLE} ` +
        'does not exist. This environment was migrated by drizzle-kit and the repository runner has never ' +
        'run here, so it would re-apply 0019-0029 from scratch and die on the unguarded ADD CONSTRAINT in ' +
        'migrations/0018_add_report_source.sql.',
    );
    printRemediation();
    return;
  }

  if (drizzleCount > ledgerCount) {
    fail(
      1,
      `The migration ledgers DISAGREE: drizzle-kit applied ${drizzleCount} migration(s) via ${DRIZZLE_TABLE}, ` +
        `but the runner's ledger ${LEDGER_TABLE} knows only ${ledgerCount}. The runner orders by filename and ` +
        'ignores drizzle-kit journal, so it would re-apply 0019-0029 and die on the unguarded `ADD CONSTRAINT ' +
        '"reports_source_check"` in migrations/0018_add_report_source.sql — after the rollout has started.',
    );
    console.log('');
    console.log(`Migrations the runner's ledger already covers: ${ledgerIds.join(', ') || '(none)'}`);
    printRemediation();
    return;
  }

  console.log(
    `Ledgers agree (${ledgerCount} applied, of which ${drizzleCount} also carry a drizzle-kit journal row). ` +
      'Safe to run the migration job.',
  );
}

main().catch((error) => {
  // WHY this exists at all: an unexpected throw must not surface as a stack trace in a
  // deploy log. Everything above converts to exit codes 1/2 with a message; this is the
  // net under that promise.
  const reason = error instanceof Error ? error.message : String(error);
  fail(2, `Migration ledger preflight failed unexpectedly: ${reason}`);
});
