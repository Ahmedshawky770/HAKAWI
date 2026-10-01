import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

import {
  DOWN_SCRIPT_DIR,
  DOWN_SCRIPT_SUFFIX,
  MIGRATION_ID_PATTERN,
  defaultMigrationsDir,
  parseMigrationId,
} from '../src/db/migrations/migration-discovery.ts';
import { MigrationStructureError } from '../src/db/migrations/migration-errors.ts';

const UP_TEMPLATE = [
  '-- Forward migration. Semicolons and "--> statement-breakpoint" markers are both',
  '-- accepted; line and block comments are ignored when the file is split into',
  '-- statements and are covered by the content checksum.',
  '',
  '',
].join('\n');

const DOWN_TEMPLATE = [
  '-- hakawi:down reversibility=TBD data-loss=TBD reason=declare the rollback plan before this migration is applied',
  '--',
  '-- reversible   restores the previous schema and destroys nothing',
  '-- data-loss    drops columns or rows; "migration:rollback" refuses it without --allow-data-loss',
  '-- irreversible cannot be undone; "migration:rollback" always refuses it',
  '',
  '',
].join('\n');

function nextSequence(migrationsDir: string): number {
  const sequences = readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .map((entry) => parseMigrationId(entry).sequence);
  return sequences.length === 0 ? 0 : Math.max(...sequences) + 1;
}

function toSlug(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (slug.length === 0) {
    throw new MigrationStructureError(`"${raw}" does not contain any characters usable in a migration name`);
  }
  return slug;
}

export type GeneratedMigration = {
  readonly id: string;
  readonly migrationPath: string;
  readonly downPath: string;
};

export function createMigration(migrationsDir: string, rawName: string): GeneratedMigration {
  const slug = toSlug(rawName);
  const id = `${String(nextSequence(migrationsDir)).padStart(4, '0')}_${slug}`;

  if (!MIGRATION_ID_PATTERN.test(id)) {
    throw new MigrationStructureError(`Generated migration id "${id}" does not match ${MIGRATION_ID_PATTERN.source}`);
  }

  const migrationPath = join(migrationsDir, `${id}.sql`);
  if (existsSync(migrationPath)) {
    throw new MigrationStructureError(`${migrationPath} already exists`);
  }

  const downDir = join(migrationsDir, DOWN_SCRIPT_DIR);
  mkdirSync(downDir, { recursive: true });
  const downPath = join(downDir, `${id}${DOWN_SCRIPT_SUFFIX}`);
  if (existsSync(downPath)) {
    throw new MigrationStructureError(`${downPath} already exists`);
  }

  writeFileSync(migrationPath, UP_TEMPLATE, { encoding: 'utf-8' });
  writeFileSync(downPath, DOWN_TEMPLATE, { encoding: 'utf-8' });

  return { id, migrationPath, downPath };
}

function main(): void {
  const migrationsDir = process.env.HAKAWI_MIGRATIONS_DIR ?? defaultMigrationsDir();
  const name = process.argv.slice(2).join(' ').trim();
  if (name.length === 0) {
    throw new MigrationStructureError('Usage: npm run db:generate -- <snake_case_name>   (e.g. -- add_story_pinned)');
  }

  const created = createMigration(migrationsDir, name);
  process.stdout.write(
    `Created ${basename(created.migrationPath)}\n` +
      `Created ${join(DOWN_SCRIPT_DIR, basename(created.downPath))}\n` +
      'Fill in the forward migration, declare reversibility in the down script, then run: npm run migration:run\n',
  );
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('generate-migration.ts')) {
  main();
}
