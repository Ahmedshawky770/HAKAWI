import { join } from 'path';

import {
  DOWN_SCRIPT_DIR,
  discoverDownScripts,
  discoverMigrationFiles,
  defaultMigrationsDir,
} from '../src/db/migrations/migration-discovery.ts';
import { MigrationError } from '../src/db/migrations/migration-errors.ts';

type CheckFinding = {
  readonly level: 'error' | 'warning';
  readonly migrationId: string;
  readonly message: string;
};

function collectFindings(migrationsDir: string): CheckFinding[] {
  const findings: CheckFinding[] = [];
  const files = discoverMigrationFiles(migrationsDir);
  const downScripts = discoverDownScripts(migrationsDir);
  const sequences = files.map((file) => ({ id: file.id, sequence: Number.parseInt(file.id.slice(0, 4), 10) }));

  for (let index = 1; index < sequences.length; index += 1) {
    const previous = sequences[index - 1] as { id: string; sequence: number };
    const current = sequences[index] as { id: string; sequence: number };
    if (current.sequence !== previous.sequence + 1) {
      findings.push({
        level: 'warning',
        migrationId: current.id,
        message:
          `sequence jumps from ${previous.sequence} to ${current.sequence}. The gap is PERMANENT: migration:create ` +
          'allocates max(sequence) + 1 and never fills a hole, so this file must not be renumbered. What the gap does ' +
          'forbid is back-filling the missing number by hand: the runner refuses to apply a pending file that sits below ' +
          'the last applied one, and refuses to apply a later file while an earlier one is pending. See ' +
          'assertNoDrift in src/db/migrations/migration-runner.ts and the regression tests named "SANDWICHED" and ' +
          '"clean prefix".',
      });
    }
  }

  for (const file of files) {
    const script = downScripts.get(file.id);
    if (script === undefined) {
      findings.push({
        level: 'warning',
        migrationId: file.id,
        message: `no ${join(DOWN_SCRIPT_DIR, `${file.id}.down.sql`)}; "migration:rollback" will refuse this migration`,
      });
      continue;
    }
    if (script.reason.includes('declare the rollback plan')) {
      findings.push({
        level: 'error',
        migrationId: file.id,
        message: `${join(DOWN_SCRIPT_DIR, `${file.id}.down.sql`)} still carries the generated placeholder; declare reversibility, data-loss and a reason`,
      });
      continue;
    }
    if (script.reversibility === 'irreversible') {
      findings.push({
        level: 'warning',
        migrationId: file.id,
        message: `irreversible by declaration: ${script.reason}`,
      });
    }
    if (script.reversibility !== 'irreversible' && script.statements.length === 0) {
      findings.push({
        level: 'error',
        migrationId: file.id,
        message: `declares reversibility=${script.reversibility} but the down script contains no executable statement`,
      });
    }
  }

  const fileIds = new Set(files.map((file) => file.id));
  for (const id of downScripts.keys()) {
    if (!fileIds.has(id)) {
      findings.push({
        level: 'error',
        migrationId: id,
        message: `a down script exists for ${id} but no forward migration does`,
      });
    }
  }

  return findings;
}

export function checkMigrations(migrationsDir: string): CheckFinding[] {
  return collectFindings(migrationsDir);
}

function main(): void {
  const migrationsDir = process.env.HAKAWI_MIGRATIONS_DIR ?? defaultMigrationsDir();
  const findings = checkMigrations(migrationsDir);
  const files = discoverMigrationFiles(migrationsDir);

  process.stdout.write(`Checked ${files.length} migration file(s) in ${migrationsDir}\n`);
  for (const finding of findings) {
    process.stdout.write(`${finding.level.toUpperCase()} ${finding.migrationId}: ${finding.message}\n`);
  }

  const errors = findings.filter((finding) => finding.level === 'error');
  if (errors.length > 0) {
    process.stderr.write(`db:check found ${errors.length} error(s) in ${migrationsDir}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `db:check passed with ${findings.length} warning(s). Run "npm run migration:verify" against a live database to check checksums.\n`,
  );
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('check-migrations.ts')) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof MigrationError ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
