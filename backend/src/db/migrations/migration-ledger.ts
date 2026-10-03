import { sql } from 'drizzle-orm';

import {
  readNullableTimestamp,
  readRequiredInteger,
  readRequiredString,
  readTimestamp,
  type MigrationExecutor,
} from './migration-executor.ts';
import { quoteSqlIdentifier, quoteSqlInteger, quoteSqlText } from './sql-literal.ts';
import type { LedgerRow } from './migration-types.ts';

export const LEDGER_TABLE = 'drizzle_migrations';

const LEDGER_COLUMNS = [
  'id',
  'migration_id',
  'filename',
  'checksum',
  'applied_at',
  'execution_ms',
  'statement_count',
  'rolled_back_at',
] as const;

export const LEDGER_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS ${quoteSqlIdentifier(LEDGER_TABLE)} (
     id SERIAL PRIMARY KEY,
     migration_id VARCHAR(255) UNIQUE NOT NULL,
     filename VARCHAR(255) NOT NULL DEFAULT '',
     checksum VARCHAR(64) NOT NULL DEFAULT '',
     applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     execution_ms INTEGER NOT NULL DEFAULT 0,
     statement_count INTEGER NOT NULL DEFAULT 0,
     rolled_back_at TIMESTAMPTZ
   )`,
  `ALTER TABLE ${quoteSqlIdentifier(LEDGER_TABLE)} ADD COLUMN IF NOT EXISTS filename VARCHAR(255) NOT NULL DEFAULT ''`,
  `ALTER TABLE ${quoteSqlIdentifier(LEDGER_TABLE)} ADD COLUMN IF NOT EXISTS checksum VARCHAR(64) NOT NULL DEFAULT ''`,
  `ALTER TABLE ${quoteSqlIdentifier(LEDGER_TABLE)} ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE ${quoteSqlIdentifier(LEDGER_TABLE)} ADD COLUMN IF NOT EXISTS execution_ms INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE ${quoteSqlIdentifier(LEDGER_TABLE)} ADD COLUMN IF NOT EXISTS statement_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE ${quoteSqlIdentifier(LEDGER_TABLE)} ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteSqlIdentifier(`${LEDGER_TABLE}_migration_id_idx`)} ON ${quoteSqlIdentifier(
    LEDGER_TABLE,
  )} (migration_id)`,
];

function toLedgerRow(row: unknown): LedgerRow {
  return {
    rowId: readRequiredInteger(row, 'id'),
    migrationId: readRequiredString(row, 'migration_id'),
    filename: readRequiredString(row, 'filename'),
    checksum: readRequiredString(row, 'checksum'),
    appliedAt: readTimestamp(row, 'applied_at'),
    executionMs: readRequiredInteger(row, 'execution_ms'),
    statementCount: readRequiredInteger(row, 'statement_count'),
    rolledBackAt: readNullableTimestamp(row, 'rolled_back_at'),
  };
}

const SELECT_ACTIVE_SQL = `SELECT ${LEDGER_COLUMNS.join(', ')} FROM ${quoteSqlIdentifier(
  LEDGER_TABLE,
)} WHERE rolled_back_at IS NULL ORDER BY migration_id ASC`;

const SELECT_ALL_SQL = `SELECT ${LEDGER_COLUMNS.join(', ')} FROM ${quoteSqlIdentifier(LEDGER_TABLE)} ORDER BY id ASC`;

export async function ensureLedgerTable(executor: MigrationExecutor): Promise<void> {
  for (const statement of LEDGER_DDL) {
    await executor.execute(sql.raw(statement));
  }
}

export async function readActiveLedger(executor: MigrationExecutor): Promise<LedgerRow[]> {
  const result = await executor.execute(sql.raw(SELECT_ACTIVE_SQL));
  return result.rows.map(toLedgerRow);
}

export async function readFullLedger(executor: MigrationExecutor): Promise<LedgerRow[]> {
  const result = await executor.execute(sql.raw(SELECT_ALL_SQL));
  return result.rows.map(toLedgerRow);
}

export type LedgerWrite = {
  readonly migrationId: string;
  readonly filename: string;
  readonly checksum: string;
  readonly executionMs: number;
  readonly statementCount: number;
};

export function buildUpsertLedgerStatement(write: LedgerWrite): string {
  return (
    `INSERT INTO ${quoteSqlIdentifier(LEDGER_TABLE)} ` +
    '(migration_id, filename, checksum, applied_at, execution_ms, statement_count, rolled_back_at) ' +
    `VALUES (${quoteSqlText(write.migrationId)}, ${quoteSqlText(write.filename)}, ${quoteSqlText(
      write.checksum,
    )}, NOW(), ${quoteSqlInteger(write.executionMs)}, ${quoteSqlInteger(write.statementCount)}, NULL) ` +
    `ON CONFLICT (migration_id) DO UPDATE SET filename = EXCLUDED.filename, checksum = EXCLUDED.checksum, ` +
    'applied_at = EXCLUDED.applied_at, execution_ms = EXCLUDED.execution_ms, ' +
    'statement_count = EXCLUDED.statement_count, rolled_back_at = NULL'
  );
}

export async function writeLedgerRow(executor: MigrationExecutor, write: LedgerWrite): Promise<void> {
  await executor.execute(sql.raw(buildUpsertLedgerStatement(write)));
}

export function buildMarkRolledBackStatement(migrationId: string): string {
  return (
    `UPDATE ${quoteSqlIdentifier(LEDGER_TABLE)} SET rolled_back_at = NOW() ` +
    `WHERE migration_id = ${quoteSqlText(migrationId)} AND rolled_back_at IS NULL`
  );
}

export async function markLedgerRowRolledBack(executor: MigrationExecutor, migrationId: string): Promise<void> {
  await executor.execute(sql.raw(buildMarkRolledBackStatement(migrationId)));
}

export function buildAdoptChecksumStatement(migrationId: string, checksum: string, filename: string): string {
  return (
    `UPDATE ${quoteSqlIdentifier(LEDGER_TABLE)} SET checksum = ${quoteSqlText(checksum)}, ` +
    `filename = ${quoteSqlText(filename)} WHERE migration_id = ${quoteSqlText(migrationId)} AND checksum = ''`
  );
}

export async function adoptLegacyChecksum(
  executor: MigrationExecutor,
  migrationId: string,
  checksum: string,
  filename: string,
): Promise<void> {
  await executor.execute(sql.raw(buildAdoptChecksumStatement(migrationId, checksum, filename)));
}

/**
 * Restore the real application time on rows written by the previous runner.
 *
 * WHY this exists: the old ledger recorded when each migration ran in `executed_at`, and the new
 * schema has `applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Adding that column backfilled every
 * pre-existing row with the moment the new runner first ran, so `migration:status` reported the
 * entire migration history as applied on a single day — which is exactly the information an
 * operator reads when they want to know how long a table has existed.
 *
 * Only rows still carrying the legacy marker (`checksum = ''`) are touched, and only when the old
 * column is actually present, so this is safe to run on a database that never had the old runner.
 */
export const BACKFILL_LEGACY_APPLIED_AT_SQL =
  `UPDATE ${quoteSqlIdentifier(LEDGER_TABLE)} SET applied_at = executed_at ` +
  `WHERE checksum = '' AND executed_at IS NOT NULL`;

export async function backfillLegacyAppliedAt(executor: MigrationExecutor): Promise<boolean> {
  const present = await executor.execute(
    sql.raw(
      `SELECT 1 FROM information_schema.columns WHERE table_name = ${quoteSqlText(LEDGER_TABLE)} ` +
        `AND column_name = 'executed_at'`,
    ),
  );
  if (present.rows.length === 0) {
    return false;
  }
  await executor.execute(sql.raw(BACKFILL_LEGACY_APPLIED_AT_SQL));
  return true;
}
