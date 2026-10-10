import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MigrationExecutor } from './migration-executor.ts';
import {
  MigrationChecksumMismatchError,
  MigrationLedgerDriftError,
  MigrationNotReversibleError,
} from './migration-errors.ts';
import { buildStatusEntries, formatStatusTable, MigrationRunner } from './migration-runner.ts';
import type { LedgerRow } from './migration-types.ts';

type FakeLedgerRow = Omit<LedgerRow, 'appliedAt' | 'rolledBackAt'> & { appliedAt: Date; rolledBackAt: Date | null };

type RecordedStatement = { readonly text: string };

function sqlText(query: unknown): string {
  if (typeof query !== 'object' || query === null) {
    return '';
  }
  const chunks = (query as { queryChunks?: unknown }).queryChunks;
  if (!Array.isArray(chunks)) {
    return '';
  }
  return chunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown }).value;
      if (typeof value === 'string') {
        return value;
      }
      if (!Array.isArray(value)) {
        return '';
      }
      return value.map((part) => (typeof part === 'string' ? part : '')).join('');
    })
    .join('');
}

class FakeDatabase implements MigrationExecutor {
  readonly executed: RecordedStatement[] = [];
  readonly transactions: RecordedStatement[][] = [];
  rows: FakeLedgerRow[] = [];
  failOn: { readonly pattern: RegExp; readonly message: string } | null = null;
  committed: RecordedStatement[] = [];
  private depth = 0;
  private buffer: RecordedStatement[] = [];

  seed(rows: readonly LedgerRow[]): void {
    this.rows = rows.map((row) => ({ ...row }));
  }

  async execute(query: ReturnType<typeof sql.raw>): Promise<{ readonly rows: readonly unknown[] }> {
    const text = sqlText(query);
    if (this.failOn !== null && this.failOn.pattern.test(text)) {
      throw new Error(this.failOn.message);
    }
    this.executed.push({ text });
    if (this.depth > 0) {
      this.buffer.push({ text });
    }
    if (text.startsWith('SELECT')) {
      return { rows: this.selectRows(text) };
    }
    if (text.startsWith('UPDATE') && text.includes('rolled_back_at = NOW()')) {
      this.rows = this.rows.map((row) =>
        row.migrationId === text.match(/migration_id = '([^']+)'/)?.[1] ? { ...row, rolledBackAt: new Date() } : row,
      );
      return { rows: [] };
    }
    if (text.startsWith('UPDATE')) {
      return { rows: [] };
    }
    if (text.startsWith('INSERT INTO "drizzle_migrations"')) {
      const migrationId = text.match(/VALUES \('([^']+)'/)?.[1];
      const filename = text.match(/VALUES \('[^']+', '([^']+)'/)?.[1];
      const checksum = text.match(/VALUES \('[^']+', '[^']+', '([^']+)'/)?.[1];
      if (migrationId !== undefined && filename !== undefined && checksum !== undefined) {
        this.rows = this.rows.filter((row) => row.migrationId !== migrationId);
        this.rows.push({
          rowId: this.rows.length + 1,
          migrationId,
          filename,
          checksum,
          appliedAt: new Date(),
          executionMs: 1,
          statementCount: 1,
          rolledBackAt: null,
        });
      }
      return { rows: [] };
    }
    return { rows: [] };
  }

  async transaction<T>(run: (tx: MigrationExecutor) => Promise<T>): Promise<T> {
    const outer = this.depth === 0;
    this.depth += 1;
    this.buffer = outer ? [] : this.buffer;
    const snapshot = this.rows.map((row) => ({ ...row }));
    const statementsBefore = this.executed.length;
    try {
      const result = await run(this);
      if (outer) {
        this.transactions.push(this.buffer);
        this.committed = this.committed.concat(this.buffer);
      }
      return result;
    } catch (error) {
      this.rows = snapshot;
      this.executed.length = statementsBefore;
      throw error;
    } finally {
      this.depth -= 1;
      if (outer) {
        this.buffer = [];
      }
    }
  }

  private selectRows(text: string): unknown[] {
    const activeOnly = text.includes('rolled_back_at IS NULL');
    return this.rows
      .filter((row) => (activeOnly ? row.rolledBackAt === null : true))
      .map((row) => ({
        id: row.rowId,
        migration_id: row.migrationId,
        filename: row.filename,
        checksum: row.checksum,
        applied_at: row.appliedAt,
        execution_ms: row.executionMs,
        statement_count: row.statementCount,
        rolled_back_at: row.rolledBackAt,
      }));
  }
}

/**
 * The statements a migration actually applied, with the runner's own session plumbing removed.
 *
 * `SET LOCAL lock_timeout` / `SET LOCAL statement_timeout` are issued at the top of every
 * migration transaction so a blocked migration fails with a diagnostic instead of hanging, and
 * the advisory lock surrounds the whole run. Those are runner concerns, not migration content, so
 * they are filtered out here; the tests that care about them assert on the raw list instead.
 */
function applicationStatements(database: FakeDatabase): string[] {
  return database.committed
    .map((statement) => statement.text)
    .filter(
      (text) =>
        !text.startsWith('INSERT INTO "drizzle_migrations"') &&
        !text.startsWith('UPDATE "drizzle_migrations"') &&
        !text.startsWith('SET LOCAL ') &&
        !text.startsWith('SELECT pg_advisory_'),
    );
}

/** The real content checksum of a migration file, so a seeded ledger row does not trip drift. */
function checksumOf(dir: string, migrationId: string): string {
  const file = new MigrationRunner(new FakeDatabase(), dir, {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  })
    .list()
    .find((candidate) => candidate.id === migrationId);
  if (file === undefined) {
    throw new Error(`No such migration file in the workspace: ${migrationId}`);
  }
  return file.checksum;
}

/** Every statement the runner issued, transaction-scoped or not, runner plumbing included. */
function allStatements(database: FakeDatabase): string[] {
  return database.executed.map((statement) => statement.text);
}

function ledgerRow(overrides: Partial<LedgerRow> & { migrationId: string }): LedgerRow {
  return {
    rowId: 1,
    filename: `${overrides.migrationId}.sql`,
    checksum: 'a'.repeat(64),
    appliedAt: new Date('2026-01-01T00:00:00.000Z'),
    executionMs: 12,
    statementCount: 1,
    rolledBackAt: null,
    ...overrides,
  };
}

type MockLog = {
  info: ReturnType<typeof vi.fn<(message: string) => void>>;
  warn: ReturnType<typeof vi.fn<(message: string) => void>>;
  error: ReturnType<typeof vi.fn<(message: string) => void>>;
};

function createLog(): MockLog {
  return {
    info: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
  };
}

function writeMigration(dir: string, id: string, body: string): void {
  writeFileSync(join(dir, `${id}.sql`), body);
}

function writeDown(dir: string, id: string, body: string): void {
  mkdirSync(join(dir, 'down'), { recursive: true });
  writeFileSync(join(dir, 'down', `${id}.down.sql`), body);
}

describe('MigrationRunner', () => {
  let workspace: string;
  let database: FakeDatabase;
  let log: MockLog;
  let runner: MigrationRunner;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'hakawi-runner-'));
    mkdirSync(join(workspace, 'down'), { recursive: true });
    writeMigration(workspace, '0000_first', 'CREATE TABLE a (id int);');
    writeMigration(workspace, '0001_second', 'CREATE TABLE b (id int);CREATE INDEX i ON b (id);');
    writeDown(
      workspace,
      '0000_first',
      '-- hakawi:down reversibility=reversible data-loss=none reason=Drops a.\nDROP TABLE a;',
    );
    writeDown(
      workspace,
      '0001_second',
      '-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops b.\nDROP TABLE b;',
    );
    database = new FakeDatabase();
    log = createLog();
    runner = new MigrationRunner(database, workspace, log);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  describe('up', () => {
    it('applies every pending migration, one transaction per file', async () => {
      const result = await runner.up();

      expect(result.applied).toEqual(['0000_first', '0001_second']);
      expect(database.transactions).toHaveLength(2);
      expect(applicationStatements(database)).toEqual([
        'CREATE TABLE a (id int)',
        'CREATE TABLE b (id int)',
        'CREATE INDEX i ON b (id)',
      ]);
    });

    it('executes every statement of a file inside a single transaction', async () => {
      await runner.up();

      const firstTransaction = database.transactions[0]?.map((statement) => statement.text) ?? [];
      // Two SET LOCAL timeouts, one DDL statement, one ledger insert. All four inside the same
      // transaction, which is what makes a mid-file failure leave no partial DDL and no ledger row.
      expect(firstTransaction).toHaveLength(4);
      expect(firstTransaction[0]).toBe("SET LOCAL lock_timeout = '10s'");
      expect(firstTransaction[1]).toBe("SET LOCAL statement_timeout = '5min'");
      expect(firstTransaction[2]).toBe('CREATE TABLE a (id int)');
      expect(firstTransaction[3]).toMatch(/^INSERT INTO "drizzle_migrations"/);
      expect(firstTransaction[3]).toContain("'0000_first'");
      expect(firstTransaction[3]).toContain("'0000_first.sql'");
    });

    it('bounds how long one migration may block on a lock, so a deploy cannot hang', async () => {
      await runner.up();

      // Without these, a migration queued behind a long-running transaction waits indefinitely:
      // in CI or a deploy that is a job that never finishes and never says why.
      expect(allStatements(database)).toContain("SET LOCAL lock_timeout = '10s'");
      expect(allStatements(database)).toContain("SET LOCAL statement_timeout = '5min'");
    });

    it('takes a session advisory lock for the whole run, so two runners cannot collide', async () => {
      await runner.up();

      const lockStatements = allStatements(database).filter((text) => text.startsWith('SELECT pg_advisory_'));
      expect(lockStatements[0]).toBe('SELECT pg_advisory_lock(1212238657)');
      expect(lockStatements.at(-1)).toBe('SELECT pg_advisory_unlock(1212238657)');

      // The lock must be taken before any DDL and released only after the last of it.
      const firstDdl = allStatements(database).indexOf('CREATE TABLE a (id int)');
      expect(lockStatements.length).toBeGreaterThanOrEqual(2);
      expect(allStatements(database).indexOf(lockStatements[0] as string)).toBeLessThan(firstDdl);
    });

    it('creates the ledger before reading it and is safe to re-run', async () => {
      await runner.up();
      const second = await runner.up();

      expect(second.applied).toEqual([]);
      expect(second.skipped).toEqual(['0000_first', '0001_second']);
    });

    it('is idempotent at the SQL level: every create statement is guarded by IF NOT EXISTS', async () => {
      rmSync(workspace, { recursive: true, force: true });
      mkdirSync(join(workspace, 'down'), { recursive: true });
      writeMigration(
        workspace,
        '0000_first',
        'CREATE TABLE IF NOT EXISTS a (id int);\nCREATE INDEX IF NOT EXISTS i ON a (id);',
      );

      const once = new MigrationRunner(new FakeDatabase(), workspace, createLog());
      await once.up();
      const twice = new MigrationRunner(new FakeDatabase(), workspace, createLog());
      await twice.up();

      expect(once.list()[0]?.statements.every((statement) => /IF NOT EXISTS/.test(statement))).toBe(true);
    });

    it('rolls the whole file back when a statement fails and names the file', async () => {
      rmSync(workspace, { recursive: true, force: true });
      mkdirSync(join(workspace, 'down'), { recursive: true });
      writeMigration(workspace, '0000_broken', 'CREATE TABLE ok (id int);SELECT boom();');
      database.failOn = { pattern: /boom/, message: 'syntax error at or near "boom"' };

      await expect(new MigrationRunner(database, workspace, log).up()).rejects.toThrow(
        /Migration 0000_broken \(0000_broken.sql\) failed at: syntax error.*The transaction was rolled back/,
      );
      expect(database.committed).toEqual([]);
    });

    it('adopts the on-disk checksum for a row written by the pre-checksum runner and warns that it cannot be proven', async () => {
      const file = runner.list()[0];
      database.seed([ledgerRow({ migrationId: '0000_first', checksum: '', filename: '' })]);

      const result = await runner.up();

      expect(result.adoptedLegacyChecksums).toEqual(['0000_first']);
      expect(result.applied).toEqual(['0001_second']);
      expect(result.skipped).toEqual(['0000_first']);
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('cannot be proven identical'));
      expect(database.executed.some((statement) => statement.text.includes(`'${file?.checksum as string}'`))).toBe(
        true,
      );
    });

    it('hard errors when an already applied migration changed on disk', async () => {
      database.seed([ledgerRow({ migrationId: '0000_first', checksum: 'b'.repeat(64) })]);

      await expect(runner.up()).rejects.toThrow(MigrationChecksumMismatchError);
      await expect(runner.up()).rejects.toThrow(/An applied migration must never be edited/);
      expect(database.committed).toEqual([]);
    });

    it('hard errors when an applied migration file has disappeared', async () => {
      database.seed([ledgerRow({ migrationId: '0000_first' })]);
      rmSync(join(workspace, '0000_first.sql'));

      await expect(runner.up()).rejects.toThrow(MigrationLedgerDriftError);
      await expect(runner.up()).rejects.toThrow(/must never be deleted/);
    });

    it('hard errors when a migration is applied out of order', async () => {
      rmSync(join(workspace, '0000_first.sql'));
      writeMigration(workspace, '0000_first', 'CREATE TABLE a (id int);');
      database.seed([ledgerRow({ migrationId: '0000_first' }), ledgerRow({ migrationId: '0001_second', rowId: 2 })]);

      await expect(runner.up()).rejects.toThrow(/already applied/);
    });

    it('hard errors when a pending migration is SANDWICHED between two applied ones', async () => {
      // The regression this guards: the old check compared each pending file against the highest
      // applied sequence seen SO FAR. With 0000 applied, 0001 pending and 0002 applied, the loop
      // reached 0001 while the running maximum was still 0, so 1 < 0 was false and the file
      // passed — and `up()` then executed 0001 AFTER 0002. A 0001 that creates something 0002
      // depends on produced a silently wrong schema. The repository has a live gap at 0017, so
      // this is reachable.
      rmSync(join(workspace, '0001_second.sql'));
      writeMigration(workspace, '0001_second', 'CREATE TABLE b (id int);');
      writeMigration(workspace, '0002_third', 'CREATE TABLE c (id int);');
      database.seed([
        ledgerRow({ migrationId: '0000_first', checksum: checksumOf(workspace, '0000_first') }),
        ledgerRow({ migrationId: '0002_third', rowId: 3, checksum: checksumOf(workspace, '0002_third') }),
      ]);

      await expect(runner.up()).rejects.toThrow(MigrationLedgerDriftError);
      await expect(runner.up()).rejects.toThrow(/0001_second is pending while a later migration/);
      // Nothing was executed: the drift is detected before the first DDL statement.
      expect(applicationStatements(database)).toEqual([]);
    });

    it('hard errors when an applied migration sits after a pending one', async () => {
      // The mirror image: 0002 is recorded as applied while 0001 was never run.
      rmSync(join(workspace, '0001_second.sql'));
      writeMigration(workspace, '0001_second', 'CREATE TABLE b (id int);');
      writeMigration(workspace, '0002_third', 'CREATE TABLE c (id int);');
      database.seed([
        ledgerRow({ migrationId: '0000_first', checksum: checksumOf(workspace, '0000_first') }),
        ledgerRow({ migrationId: '0002_third', rowId: 3, checksum: checksumOf(workspace, '0002_third') }),
      ]);

      // The same rule catches both directions: the pending file is found first in file order,
      // and the message names the later migration that should not have been applied yet.
      await expect(runner.up()).rejects.toThrow(/0001_second is pending while a later migration/);
    });

    it('accepts a chain where the applied migrations are a clean prefix', async () => {
      writeMigration(workspace, '0002_third', 'CREATE TABLE c (id int);');
      database.seed([ledgerRow({ migrationId: '0000_first', checksum: checksumOf(workspace, '0000_first') })]);

      const result = await runner.up();

      expect(result.applied).toEqual(['0001_second', '0002_third']);
    });
  });

  describe('down', () => {
    beforeEach(async () => {
      await runner.up();
      database = new FakeDatabase();
      database.seed(
        runner
          .list()
          .map((file, index) =>
            ledgerRow({ migrationId: file.id, rowId: index + 1, checksum: file.checksum, filename: file.filename }),
          ),
      );
      runner = new MigrationRunner(database, workspace, log);
    });

    it('refuses a data-loss rollback without the acknowledgement flag and runs nothing', async () => {
      await expect(runner.down({ steps: null, to: null, allowDataLoss: false })).rejects.toThrow(
        MigrationNotReversibleError,
      );
      await expect(runner.down({ steps: null, to: null, allowDataLoss: false })).rejects.toThrow(
        /Re-run with --allow-data-loss/,
      );
      expect(database.committed).toEqual([]);
    });

    it('rolls back a data-loss migration once the loss is acknowledged', async () => {
      const result = await runner.down({ steps: 1, to: null, allowDataLoss: true });

      expect(result.rolledBack).toEqual(['0001_second']);
      expect(applicationStatements(database)).toEqual(['DROP TABLE b']);
    });

    it('rolls back a reversible migration without any flag', async () => {
      writeDown(
        workspace,
        '0001_second',
        '-- hakawi:down reversibility=reversible data-loss=none reason=Drops an index only.\nDROP INDEX i;',
      );
      runner = new MigrationRunner(database, workspace, log);

      const result = await runner.down({ steps: 1, to: null, allowDataLoss: false });

      expect(result.rolledBack).toEqual(['0001_second']);
      expect(applicationStatements(database)).toEqual(['DROP INDEX i']);
    });

    it('rolls back N migrations newest first', async () => {
      const result = await runner.down({ steps: 2, to: null, allowDataLoss: true });

      expect(result.rolledBack).toEqual(['0001_second', '0000_first']);
      expect(applicationStatements(database)).toEqual(['DROP TABLE b', 'DROP TABLE a']);
    });

    it('keeps the target migration applied when rolling back to it', async () => {
      const result = await runner.down({ steps: null, to: '0000_first', allowDataLoss: true });

      expect(result.rolledBack).toEqual(['0001_second']);
    });

    it('refuses an irreversible rollback and runs nothing', async () => {
      writeDown(
        workspace,
        '0001_second',
        '-- hakawi:down reversibility=irreversible reason=Creates a shared extension.\nDROP TABLE b;',
      );
      runner = new MigrationRunner(database, workspace, log);

      await expect(runner.down({ steps: 1, to: null, allowDataLoss: true })).rejects.toThrow(
        MigrationNotReversibleError,
      );
      expect(database.committed).toEqual([]);
    });

    it('refuses when the down script is missing entirely', async () => {
      rmSync(join(workspace, 'down', '0001_second.down.sql'));
      runner = new MigrationRunner(database, workspace, log);

      await expect(runner.down({ steps: 1, to: null, allowDataLoss: true })).rejects.toThrow(/no down script exists/);
    });

    it('refuses a down script that declares reversibility but has no statement', async () => {
      writeDown(
        workspace,
        '0001_second',
        '-- hakawi:down reversibility=reversible reason=nothing here\n-- no statement\n',
      );
      runner = new MigrationRunner(database, workspace, log);

      await expect(runner.down({ steps: 1, to: null, allowDataLoss: false })).rejects.toThrow(
        /no executable statement/,
      );
    });

    it('validates every target before executing the first one', async () => {
      writeDown(
        workspace,
        '0000_first',
        '-- hakawi:down reversibility=irreversible reason=cannot be undone.\nDROP TABLE a;',
      );
      runner = new MigrationRunner(database, workspace, log);

      await expect(runner.down({ steps: 2, to: null, allowDataLoss: true })).rejects.toThrow(/cannot be undone/);
      expect(database.committed).toEqual([]);
    });

    it('refuses to roll back further back than the applied history', async () => {
      await expect(runner.down({ steps: 5, to: null, allowDataLoss: true })).rejects.toThrow(/only 2 are applied/);
    });

    it('refuses a target that was never applied', async () => {
      await expect(runner.down({ steps: null, to: '0009_missing', allowDataLoss: true })).rejects.toThrow(
        /not recorded as applied/,
      );
    });

    it('rejects a target that is not a migration id', async () => {
      await expect(runner.down({ steps: null, to: 'nope', allowDataLoss: true })).rejects.toThrow(
        /does not follow the required NNNN_snake_case_name.sql convention/,
      );
    });

    it('marks the ledger row rolled back instead of deleting it', async () => {
      await runner.down({ steps: 1, to: null, allowDataLoss: true });

      expect(database.rows.find((row) => row.migrationId === '0001_second')?.rolledBackAt).toBeInstanceOf(Date);
      expect(database.rows.find((row) => row.migrationId === '0000_first')?.rolledBackAt).toBeNull();
    });

    it('does nothing when the ledger is empty', async () => {
      database.rows = [];

      await expect(runner.down({ steps: 1, to: null, allowDataLoss: true })).resolves.toEqual({ rolledBack: [] });
    });
  });

  describe('status and verify', () => {
    it('reports applied, pending and reversibility for every migration', async () => {
      const entries = await runner.status();

      expect(entries.map((entry) => `${entry.id}:${entry.kind}`)).toEqual([
        '0000_first:pending',
        '0001_second:pending',
      ]);
      expect(entries[0]?.reversibility).toBe('reversible');
      expect(entries[1]?.reversibility).toBe('data-loss');
    });

    it('surfaces a checksum mismatch instead of hiding it', async () => {
      database.seed([ledgerRow({ migrationId: '0000_first', checksum: 'c'.repeat(64) })]);

      const entries = await runner.status();

      expect(entries[0]?.kind).toBe('checksum-mismatch');
      expect(entries[0]?.detail).toContain('but the file hashes to');
    });

    it('surfaces an orphaned ledger row', async () => {
      database.seed([ledgerRow({ migrationId: '0000_first' }), ledgerRow({ migrationId: '0099_ghost', rowId: 2 })]);

      const entries = await runner.status();

      expect(entries.map((entry) => entry.kind)).toContain('orphan-ledger');
    });

    it('ignores rows that were rolled back', async () => {
      database.seed([ledgerRow({ migrationId: '0000_first', rolledBackAt: new Date() })]);

      const entries = await runner.status();

      expect(entries[0]?.kind).toBe('pending');
    });

    it('verify passes on a clean ledger and fails on drift', async () => {
      await expect(runner.verify()).resolves.toHaveLength(2);

      database.seed([ledgerRow({ migrationId: '0000_first', checksum: 'd'.repeat(64) })]);
      await expect(runner.verify()).rejects.toThrow(MigrationLedgerDriftError);
    });
  });
});

describe('buildStatusEntries', () => {
  it('marks an applied irreversible migration without hiding that fact', () => {
    const files = [
      {
        id: '0001_first',
        filename: '0001_first.sql',
        absolutePath: '/x',
        checksum: 'a'.repeat(64),
        statements: ['SELECT 1'],
      },
    ];
    const downScripts = new Map([
      [
        '0001_first',
        {
          id: '0001_first',
          filename: '0001_first.down.sql',
          absolutePath: '/y',
          reversibility: 'irreversible' as const,
          dataLoss: 'rows' as const,
          reason: 'creates a shared extension',
          statements: [],
        },
      ],
    ]);

    const entries = buildStatusEntries(files, [ledgerRow({ migrationId: '0001_first' })], downScripts);

    expect(entries[0]?.kind).toBe('irreversible');
    expect(entries[0]?.detail).toContain('creates a shared extension');
  });
});

describe('formatStatusTable', () => {
  it('renders a header and one aligned row per migration', () => {
    const table = formatStatusTable([
      {
        id: '0000_first',
        filename: '0000_first.sql',
        kind: 'applied',
        expectedChecksum: 'a'.repeat(64),
        recordedChecksum: 'a'.repeat(64),
        appliedAt: new Date('2026-01-01T00:00:00.000Z'),
        executionMs: 5,
        reversibility: 'reversible',
        detail: 'applied',
      },
    ]);

    const lines = table.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('MIGRATION');
    expect(lines[2]).toContain('0000_first');
    expect(lines[2]).toContain('2026-01-01T00:00:00.000Z');
  });

  it('says so when there is nothing to show', () => {
    expect(formatStatusTable([])).toBe('No migrations found.');
  });
});
