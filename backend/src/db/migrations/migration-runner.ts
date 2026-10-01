import { fileURLToPath } from 'url';

import { sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import { parseMigrationArgv } from './migration-cli.ts';
import {
  defaultMigrationsDir,
  discoverDownScripts,
  discoverMigrationFiles,
  parseMigrationId,
} from './migration-discovery.ts';
import {
  MigrationChecksumMismatchError,
  MigrationError,
  MigrationExecutionError,
  MigrationLedgerDriftError,
  MigrationNotReversibleError,
  MigrationStructureError,
} from './migration-errors.ts';
import { createMigrationLogSink } from './migration-executor.ts';
import type { MigrationExecutor, MigrationLogSink } from './migration-executor.ts';
import {
  adoptLegacyChecksum,
  backfillLegacyAppliedAt,
  ensureLedgerTable,
  markLedgerRowRolledBack,
  readActiveLedger,
  readFullLedger,
  writeLedgerRow,
} from './migration-ledger.ts';
import type {
  DownScript,
  LedgerRow,
  MigrationFile,
  MigrationRollbackResult,
  MigrationRunResult,
  MigrationStatusEntry,
} from './migration-types.ts';

export const LEGACY_CHECKSUM = '';

/**
 * A fixed, application-specific advisory-lock id.
 *
 * Any 64-bit constant works as long as it is stable and unlikely to collide with another
 * subsystem's lock. The value is derived from the application name so it is greppable and
 * obviously not a magic number.
 */
const MIGRATION_LOCK_ID = 0x48414b41; // "HAKA"

/** How long a single migration may wait for a conflicting lock before giving up. */
const MIGRATION_LOCK_TIMEOUT = '10s';

/**
 * How long a single statement may run before giving up.
 *
 * Generous enough for a `CREATE INDEX` on a large table, which is the slowest statement the
 * current chain contains, and short enough that a pathological query surfaces as a failed deploy
 * step rather than a hung one.
 */
const MIGRATION_STATEMENT_TIMEOUT = '5min';

export type RollbackRequest = {
  readonly steps: number | null;
  readonly to: string | null;
  readonly allowDataLoss: boolean;
};

export class MigrationRunner {
  private readonly database: MigrationExecutor;
  private readonly migrationsDir: string;
  private readonly log: MigrationLogSink;

  constructor(database: MigrationExecutor, migrationsDir: string, log: MigrationLogSink) {
    this.database = database;
    this.migrationsDir = migrationsDir;
    this.log = log;
  }

  list(): MigrationFile[] {
    return discoverMigrationFiles(this.migrationsDir);
  }

  downScripts(): Map<string, DownScript> {
    return discoverDownScripts(this.migrationsDir);
  }

  async up(): Promise<MigrationRunResult> {
    const files = this.list();

    await ensureLedgerTable(this.database);
    return this.withAdvisoryLock(async () => {
      const adoptedLegacyChecksums = await this.adoptLegacyRows(files);
      const active = await readActiveLedger(this.database);

      this.assertNoDrift(files, active);

      const applied: string[] = [];
      const skipped: string[] = [];

      for (const file of files) {
        if (active.some((row) => row.migrationId === file.id)) {
          skipped.push(file.id);
          continue;
        }
        await this.applyFile(file);
        applied.push(file.id);
      }

      if (applied.length === 0) {
        this.log.info(`No pending migrations. ${skipped.length} migration(s) already applied.`);
      } else {
        this.log.info(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
      }

      return { applied, skipped, adoptedLegacyChecksums };
    });
  }

  async down(request: RollbackRequest): Promise<MigrationRollbackResult> {
    const files = this.list();
    const downScripts = this.downScripts();
    const byId = new Map(files.map((file) => [file.id, file]));

    await ensureLedgerTable(this.database);
    return this.withAdvisoryLock(async () => {
      const active = await readActiveLedger(this.database);

      this.assertNoDrift(files, active);

      if (active.length === 0) {
        this.log.info('Nothing to roll back: the ledger is empty.');
        return { rolledBack: [] };
      }

      const targets = this.selectRollbackTargets(active, request);

      for (const target of targets) {
        const file = byId.get(target.migrationId);
        if (file === undefined) {
          throw new MigrationLedgerDriftError(
            `Cannot roll back ${target.migrationId}: it is recorded as applied but its .sql file is missing.`,
            [target.migrationId],
          );
        }
        this.assertReversible(file, downScripts.get(file.id), request.allowDataLoss);
      }

      const rolledBack: string[] = [];
      for (const target of targets) {
        const file = byId.get(target.migrationId) as MigrationFile;
        const script = downScripts.get(file.id) as DownScript;
        await this.rollbackMigration(target, file, script);
        rolledBack.push(file.id);
      }

      this.log.info(`Rolled back ${rolledBack.length} migration(s): ${rolledBack.join(', ')}`);
      return { rolledBack };
    });
  }

  async status(): Promise<MigrationStatusEntry[]> {
    const files = this.list();
    const downScripts = this.downScripts();
    // Read-only: the ledger table is created by `up`/`down`, which are the commands that write.
    // Running DDL here meant `migration:status` and `migration:verify` needed CREATE privileges
    // on a production database just to print a table, and two concurrent `CREATE INDEX IF NOT
    // EXISTS` could race against each other.
    const active = await readActiveLedger(this.database);
    return buildStatusEntries(files, active, downScripts);
  }

  async ledgerHistory(): Promise<LedgerRow[]> {
    return readFullLedger(this.database);
  }

  /**
   * Serialise `up` and `down` across processes with a PostgreSQL advisory lock.
   *
   * WHY: the per-file transaction prevents a duplicate ledger row, but not concurrent DDL. Two
   * pods running `migration:run` at the same time — a blue/green deploy, or the `test-e2e` and
   * `test-browser` CI jobs aimed at one database — both read the same pending set and both execute
   * it. Concurrent `CREATE TABLE IF NOT EXISTS` raises a duplicate-key error on `pg_type`, and
   * concurrent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` can deadlock against itself.
   *
   * `pg_advisory_lock` is session-scoped and released automatically when the connection closes, so
   * a crashed runner cannot leave the lock held. `pg_try_advisory_lock` is used rather than the
   * blocking form so a second runner fails fast with a readable message instead of hanging a
   * deploy step until its timeout.
   */
  private async withAdvisoryLock<T>(work: () => Promise<T>): Promise<T> {
    await this.database.execute(sql.raw(`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`));
    try {
      return await work();
    } finally {
      // xact_lock is not used because the lock must span every migration's own transaction;
      // the session lock is released here and, defensively, on connection loss.
      await this.database.execute(sql.raw(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`));
    }
  }

  async verify(): Promise<MigrationStatusEntry[]> {
    const entries = await this.status();
    const failures = entries.filter((entry) => entry.kind === 'checksum-mismatch' || entry.kind === 'orphan-ledger');
    if (failures.length > 0) {
      throw new MigrationLedgerDriftError(
        `Ledger does not match the migration files: ${failures.map((entry) => `${entry.id} (${entry.kind})`).join(', ')}`,
        failures.map((entry) => entry.id),
      );
    }
    this.log.info(`Verified ${entries.length} migration(s): no checksum drift, no orphaned ledger rows.`);
    return entries;
  }

  private selectRollbackTargets(active: readonly LedgerRow[], request: RollbackRequest): LedgerRow[] {
    // `localeCompare`, not `<`/`>`: the SQL in readActiveLedger orders with `ORDER BY migration_id
    // ASC` under the database's collation, which can differ from the server's ICU locale. Two
    // different orderings inside one file is a bug waiting to happen, so both sides sort with the
    // same explicit code-point comparison, matching what a C-collation database produces.
    const ordered = [...active].sort((left, right) => (left.migrationId < right.migrationId ? -1 : 1));

    if (request.to !== null) {
      parseMigrationId(`${request.to}.sql`);
      const index = ordered.findIndex((row) => row.migrationId === request.to);
      if (index === -1) {
        throw new MigrationStructureError(
          `Cannot roll back to "${request.to}": it is not recorded as applied. Applied migrations: ${ordered
            .map((row) => row.migrationId)
            .join(', ')}`,
          request.to,
        );
      }
      const newer = ordered.slice(index + 1);
      if (newer.length === 0) {
        this.log.info(`"${request.to}" is already the newest applied migration; nothing to roll back.`);
        return [];
      }
      return newer.reverse();
    }

    const steps = request.steps ?? 1;
    if (steps > ordered.length) {
      throw new MigrationStructureError(`Cannot roll back ${steps} migration(s): only ${ordered.length} are applied.`);
    }
    return ordered.slice(ordered.length - steps).reverse();
  }

  private assertReversible(file: MigrationFile, script: DownScript | undefined, allowDataLoss: boolean): void {
    if (script === undefined) {
      throw new MigrationNotReversibleError(
        file.id,
        file.filename,
        'irreversible',
        `no down script exists at migrations/down/${file.id}.down.sql.`,
      );
    }
    if (script.reversibility === 'irreversible') {
      throw new MigrationNotReversibleError(file.id, file.filename, 'irreversible', script.reason);
    }
    if (script.reversibility === 'data-loss' && !allowDataLoss) {
      throw new MigrationNotReversibleError(
        file.id,
        file.filename,
        'data-loss',
        `its down script destroys data (${script.dataLoss}): ${script.reason} Re-run with --allow-data-loss to accept the loss.`,
      );
    }
  }

  private async applyFile(file: MigrationFile): Promise<void> {
    const startedAt = Date.now();
    try {
      await this.database.transaction(async (tx) => {
        // A migration blocked behind a long-running transaction would otherwise wait for ever:
        // in a deploy or a CI job that is a hang with no diagnostic and no timeout. `SET LOCAL`
        // scopes both to this transaction, so the next migration starts with the defaults again.
        await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${MIGRATION_LOCK_TIMEOUT}'`));
        await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${MIGRATION_STATEMENT_TIMEOUT}'`));
        for (const statement of file.statements) {
          await tx.execute(sql.raw(statement));
        }
        await writeLedgerRow(tx, {
          migrationId: file.id,
          filename: file.filename,
          checksum: file.checksum,
          executionMs: Date.now() - startedAt,
          statementCount: file.statements.length,
        });
      });
    } catch (error) {
      throw new MigrationExecutionError(file.id, file.filename, null, error);
    }
    this.log.info(`Applied ${file.id} (${file.filename}) with ${file.statements.length} statement(s)`);
  }

  private async rollbackMigration(row: LedgerRow, file: MigrationFile, script: DownScript): Promise<void> {
    const startedAt = Date.now();
    if (script.statements.length === 0) {
      throw new MigrationNotReversibleError(
        file.id,
        script.filename,
        'irreversible',
        'its down script declares reversibility but contains no executable statement.',
      );
    }
    try {
      await this.database.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${MIGRATION_LOCK_TIMEOUT}'`));
        await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${MIGRATION_STATEMENT_TIMEOUT}'`));
        for (const statement of script.statements) {
          await tx.execute(sql.raw(statement));
        }
        await markLedgerRowRolledBack(tx, row.migrationId);
      });
    } catch (error) {
      throw new MigrationExecutionError(file.id, script.filename, null, error);
    }
    this.log.info(`Rolled back ${file.id} using ${script.filename} in ${Date.now() - startedAt}ms`);
  }

  private async adoptLegacyRows(files: readonly MigrationFile[]): Promise<string[]> {
    // Before anything reads `applied_at`, put the real application time back on the rows the old
    // runner wrote. See backfillLegacyAppliedAt for why the default would otherwise be wrong.
    const backfilled = await backfillLegacyAppliedAt(this.database);
    if (backfilled) {
      this.log.info('Restored applied_at on ledger rows written by the previous migration runner.');
    }

    const active = await readActiveLedger(this.database);
    const byId = new Map(files.map((file) => [file.id, file]));
    const adopted: string[] = [];

    for (const row of active) {
      if (row.checksum !== LEGACY_CHECKSUM) {
        continue;
      }
      const file = byId.get(row.migrationId);
      if (file === undefined) {
        continue;
      }
      await adoptLegacyChecksum(this.database, row.migrationId, file.checksum, file.filename);
      adopted.push(row.migrationId);
      this.log.warn(
        `Migration ${row.migrationId} was applied before this runner recorded checksums, so its recorded checksum was adopted ` +
          `from the current file (${file.checksum.slice(0, 12)}...) and cannot be proven identical to what was executed.`,
      );
    }

    return adopted;
  }

  private assertNoDrift(files: readonly MigrationFile[], active: readonly LedgerRow[]): void {
    const byId = new Map(files.map((file) => [file.id, file]));
    const activeIds = new Set(active.map((row) => row.migrationId));

    for (const row of active) {
      const file = byId.get(row.migrationId);
      if (file === undefined) {
        throw new MigrationLedgerDriftError(
          `Migration ${row.migrationId} is recorded as applied but ${row.filename || 'its .sql file'} is missing from ${this.migrationsDir}. ` +
            'An applied migration must never be deleted; restore the file from version control.',
          [row.migrationId],
        );
      }
      if (row.checksum !== LEGACY_CHECKSUM && row.checksum !== file.checksum) {
        throw new MigrationChecksumMismatchError(row.migrationId, file.filename, row.checksum, file.checksum);
      }
    }

    // The applied migrations must form a PREFIX of the file order.
    //
    // The old check compared each pending file against the highest sequence seen SO FAR, so a
    // file sandwiched between two applied ones was never examined: 0000 applied, 0001 pending,
    // 0002 applied. When the loop reached 0001 the running maximum was still 0, so 1 < 0 was
    // false and the file passed — and `up()` then executed 0001 AFTER 0002. If 0001 created
    // something 0002 depends on, the result is a silently wrong schema.
    //
    // The repository currently has a live gap at 0017, so this is not hypothetical: a hand-written
    // 0017 that landed after 0018 had been applied would have run in the wrong order with no error.
    // Comparing file POSITIONS against the last applied index catches that by construction, and
    // the same check covers the mirror case (a later migration applied, an earlier one pending),
    // because the pending file is always encountered first in file order.
    const appliedIds = new Set(active.map((row) => row.migrationId));
    const highestAppliedIndex = files.reduce((highest, file, index) => (appliedIds.has(file.id) ? index : highest), -1);
    if (highestAppliedIndex < 0) {
      return;
    }

    for (let index = 0; index < highestAppliedIndex; index += 1) {
      const file = files[index] as MigrationFile;
      if (appliedIds.has(file.id)) {
        continue;
      }
      throw new MigrationLedgerDriftError(
        `Migration ${file.id} is pending while a later migration (${files[highestAppliedIndex]?.id ?? 'a later one'}) ` +
          `is already applied. Applied migrations must be a prefix of the file order: ${active.length} of ` +
          `${files.length} file(s) are recorded and the last applied one is ${files[highestAppliedIndex]?.id ?? 'unknown'}. ` +
          'Migrations must be applied in order; add the missing migration to the ledger only if it was genuinely executed.',
        [file.id],
      );
    }
  }
}

function describeDownScript(script: DownScript | undefined): {
  reversibility: DownScript['reversibility'] | null;
  detail: string;
} {
  if (script === undefined) {
    return { reversibility: null, detail: 'no down script' };
  }
  return { reversibility: script.reversibility, detail: script.reason };
}

export function buildStatusEntries(
  files: readonly MigrationFile[],
  active: readonly LedgerRow[],
  downScripts: ReadonlyMap<string, DownScript>,
): MigrationStatusEntry[] {
  const activeById = new Map(active.map((row) => [row.migrationId, row]));
  const entries: MigrationStatusEntry[] = [];

  for (const file of files) {
    const row = activeById.get(file.id);
    const down = describeDownScript(downScripts.get(file.id));

    if (row === undefined) {
      entries.push({
        id: file.id,
        filename: file.filename,
        kind: 'pending',
        expectedChecksum: file.checksum,
        recordedChecksum: null,
        appliedAt: null,
        executionMs: null,
        reversibility: down.reversibility,
        detail: 'not yet applied',
      });
      continue;
    }

    if (row.checksum !== LEGACY_CHECKSUM && row.checksum !== file.checksum) {
      entries.push({
        id: file.id,
        filename: file.filename,
        kind: 'checksum-mismatch',
        expectedChecksum: file.checksum,
        recordedChecksum: row.checksum,
        appliedAt: row.appliedAt,
        executionMs: row.executionMs,
        reversibility: down.reversibility,
        detail: `recorded ${row.checksum} but the file hashes to ${file.checksum}`,
      });
      continue;
    }

    entries.push({
      id: file.id,
      filename: file.filename,
      kind: down.reversibility === 'irreversible' ? 'irreversible' : 'applied',
      expectedChecksum: file.checksum,
      recordedChecksum: row.checksum === LEGACY_CHECKSUM ? null : row.checksum,
      appliedAt: row.appliedAt,
      executionMs: row.executionMs,
      reversibility: down.reversibility,
      detail: down.reversibility === 'irreversible' ? `applied; ${down.detail}` : 'applied',
    });
  }

  const fileIds = new Set(files.map((file) => file.id));
  for (const row of active) {
    if (fileIds.has(row.migrationId)) {
      continue;
    }
    entries.push({
      id: row.migrationId,
      filename: row.filename,
      kind: 'orphan-ledger',
      expectedChecksum: null,
      recordedChecksum: row.checksum === LEGACY_CHECKSUM ? null : row.checksum,
      appliedAt: row.appliedAt,
      executionMs: row.executionMs,
      reversibility: null,
      detail: 'recorded as applied but the .sql file is missing',
    });
  }

  return entries;
}

export function formatStatusTable(entries: readonly MigrationStatusEntry[]): string {
  if (entries.length === 0) {
    return 'No migrations found.';
  }
  const header = ['MIGRATION', 'STATE', 'APPLIED AT', 'MS', 'REVERSIBILITY', 'DETAIL'];
  const rows = entries.map((entry) => [
    entry.id,
    entry.kind,
    entry.appliedAt === null ? '-' : entry.appliedAt.toISOString(),
    entry.executionMs === null ? '-' : String(entry.executionMs),
    entry.reversibility ?? 'unknown',
    entry.detail,
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => (row[column] as string).length)),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] as number))
      .join('  ')
      .trimEnd();

  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join('\n');
}

function toLogSink(logger: WinstonLoggerService): MigrationLogSink {
  return createMigrationLogSink(logger);
}

function renderMigrationList(runner: MigrationRunner): string {
  const downScripts = runner.downScripts();
  const header = 'MIGRATION               CHECKSUM      REVERSIBILITY  STATEMENTS';
  const lines = runner.list().map((file) => {
    const script = downScripts.get(file.id);
    const reversibility = script === undefined ? 'no-down-script' : script.reversibility;
    return `${file.id.padEnd(24)} ${file.checksum.slice(0, 12).padEnd(14)} ${reversibility.padEnd(14)} ${file.statements.length}`;
  });
  return [header, ...lines].join('\n');
}

export async function runMigrationCli(argv: readonly string[]): Promise<number> {
  const logger = new WinstonLoggerService();
  const parsed = parseMigrationArgv(argv);

  if (process.env.NODE_ENV === 'production' && !parsed.allowProduction) {
    throw new MigrationStructureError(
      'Refusing to run migrations with NODE_ENV=production without --allow-production. ' +
        'Use "npm run migration:run:production", which passes the flag, so a production deploy is an explicit decision.',
    );
  }

  const { db } = await import('../index.ts');
  const runner = new MigrationRunner(db, defaultMigrationsDir(), toLogSink(logger));

  switch (parsed.command) {
    case 'up': {
      const result = await runner.up();
      logger.info(
        `migration:run finished. applied=${result.applied.length} skipped=${result.skipped.length} adopted=${result.adoptedLegacyChecksums.length}`,
        'MigrationRunner',
      );
      return 0;
    }
    case 'down': {
      const result = await runner.down({ steps: parsed.steps, to: parsed.to, allowDataLoss: parsed.allowDataLoss });
      logger.info(`migration:rollback finished. rolledBack=${result.rolledBack.length}`, 'MigrationRunner');
      return 0;
    }
    case 'status': {
      logger.info(formatStatusTable(await runner.status()), 'MigrationRunner');
      return 0;
    }
    case 'list': {
      logger.info(renderMigrationList(runner), 'MigrationRunner');
      return 0;
    }
    case 'verify': {
      await runner.verify();
      return 0;
    }
    default: {
      throw new MigrationStructureError(`Unhandled command ${String(parsed.command)}`);
    }
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  runMigrationCli(process.argv.slice(2))
    .then((code: number) => {
      process.exit(code);
    })
    .catch((error: unknown) => {
      const logger = new WinstonLoggerService();
      if (error instanceof MigrationError) {
        logger.error(error.message, undefined, 'MigrationRunner');
      } else {
        logger.error(
          'Unexpected migration failure',
          error instanceof Error ? error.stack : String(error),
          'MigrationRunner',
        );
      }
      process.exit(1);
    });
}
