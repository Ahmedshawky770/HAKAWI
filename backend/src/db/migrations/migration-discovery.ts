import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { computeMigrationChecksum } from './migration-checksum.ts';
import { MigrationStructureError } from './migration-errors.ts';
import { splitSqlStatements } from './sql-statement-splitter.ts';
import type { DownScript, MigrationDataLoss, MigrationFile, MigrationReversibility } from './migration-types.ts';

export const MIGRATION_ID_PATTERN = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)$/;
export const DOWN_SCRIPT_SUFFIX = '.down.sql';
export const DOWN_SCRIPT_DIR = 'down';
export const MIGRATIONS_DIR_ENV = 'HAKAWI_MIGRATIONS_DIR';

const REVERSIBILITY_VALUES: readonly MigrationReversibility[] = ['reversible', 'data-loss', 'irreversible'];
const DATA_LOSS_VALUES: readonly MigrationDataLoss[] = ['none', 'columns', 'rows'];
const DOWN_HEADER_PATTERN = /^--\s*hakawi:down\s+(.*)$/;
const UNDECLARED = 'TBD';

export type ParsedMigrationId = {
  readonly id: string;
  readonly sequence: number;
};

export function parseMigrationId(filename: string): ParsedMigrationId {
  if (!filename.endsWith('.sql')) {
    throw new MigrationStructureError(`Migration file ${filename} must end with .sql`);
  }
  const id = filename.slice(0, -'.sql'.length);
  const match = MIGRATION_ID_PATTERN.exec(id);
  if (match === null) {
    throw new MigrationStructureError(
      `Migration file ${filename} does not follow the required NNNN_snake_case_name.sql convention`,
    );
  }
  const sequence = Number.parseInt(match[1] as string, 10);
  return { id, sequence };
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function looksLikeMigrationsDirectory(path: string): boolean {
  if (!isDirectory(path)) {
    return false;
  }
  return readdirSync(path).some((entry) => entry.endsWith('.sql'));
}

export function resolveMigrationsDir(startDir: string, env: NodeJS.ProcessEnv = process.env): string {
  const override = env[MIGRATIONS_DIR_ENV];
  if (override !== undefined && override.length > 0) {
    const resolvedOverride = resolve(override);
    if (!looksLikeMigrationsDirectory(resolvedOverride)) {
      throw new MigrationStructureError(
        `${MIGRATIONS_DIR_ENV} points at ${resolvedOverride}, which contains no .sql migration files`,
      );
    }
    return resolvedOverride;
  }

  let current = resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(current, 'migrations');
    if (looksLikeMigrationsDirectory(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new MigrationStructureError(
    `Could not locate the migrations directory from ${startDir}. Set ${MIGRATIONS_DIR_ENV} to its absolute path.`,
  );
}

export function defaultMigrationsDir(): string {
  return resolveMigrationsDir(dirname(fileURLToPath(import.meta.url)));
}

function readMigrationFile(directory: string, filename: string): MigrationFile {
  const { id } = parseMigrationId(filename);
  const absolutePath = join(directory, filename);
  const content = readFileSync(absolutePath, 'utf-8');
  const statements = splitSqlStatements(content);
  if (statements.length === 0) {
    throw new MigrationStructureError(`Migration ${id} (${filename}) contains no executable SQL statement`, id);
  }
  return { id, filename, absolutePath, checksum: computeMigrationChecksum(content), statements };
}

export function discoverMigrationFiles(directory: string): MigrationFile[] {
  const filenames = readdirSync(directory)
    .filter((entry) => entry.endsWith('.sql'))
    .sort();

  const files: MigrationFile[] = [];
  const seenIds = new Map<string, string>();
  let previousSequence: number | null = null;
  let previousId: string | null = null;

  for (const filename of filenames) {
    const file = readMigrationFile(directory, filename);
    const duplicate = seenIds.get(file.id);
    if (duplicate !== undefined) {
      throw new MigrationStructureError(
        `Duplicate migration id ${file.id} is claimed by both ${duplicate} and ${filename}. Migration ids must be unique.`,
        file.id,
      );
    }
    const { sequence } = parseMigrationId(filename);
    if (previousSequence !== null) {
      if (sequence === previousSequence) {
        throw new MigrationStructureError(
          `Two migrations claim sequence ${String(sequence).padStart(4, '0')}: ${seenIds.get(previousId as string) as string} and ${filename}. ` +
            'Each migration must get its own number.',
          file.id,
        );
      }
      if (sequence < previousSequence) {
        throw new MigrationStructureError(
          `Migration ${filename} is not ordered after the previous migration. Files must sort by their NNNN_ prefix.`,
          file.id,
        );
      }
    }
    previousId = file.id;
    previousSequence = sequence;
    seenIds.set(file.id, filename);
    files.push(file);
  }

  if (files.length === 0) {
    throw new MigrationStructureError(`No .sql migrations found in ${directory}`);
  }

  return files;
}

function parseDownHeader(
  content: string,
  filename: string,
): {
  readonly reversibility: MigrationReversibility | null;
  readonly dataLoss: MigrationDataLoss | null;
  readonly reason: string | null;
} {
  let headerBody: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const match = DOWN_HEADER_PATTERN.exec(line.trim());
    if (match !== null) {
      headerBody = match[1] as string;
      break;
    }
  }

  if (headerBody === null) {
    return { reversibility: null, dataLoss: null, reason: null };
  }

  const body = headerBody;
  const reversibilityMatch = /reversibility=(\S+)/.exec(body);
  const dataLossMatch = /data-loss=(\S+)/.exec(body);
  const reasonMatch = /reason=(.*)$/.exec(body.trim());

  const reversibility = reversibilityMatch?.[1];
  if (reversibility === UNDECLARED) {
    return { reversibility: null, dataLoss: null, reason: reasonMatch?.[1]?.trim() ?? null };
  }
  if (reversibility !== undefined && !REVERSIBILITY_VALUES.includes(reversibility as MigrationReversibility)) {
    throw new MigrationStructureError(
      `${filename} declares reversibility=${reversibility}, expected one of ${REVERSIBILITY_VALUES.join(', ')}`,
    );
  }

  const dataLoss = dataLossMatch?.[1];
  if (dataLoss !== undefined && !DATA_LOSS_VALUES.includes(dataLoss as MigrationDataLoss)) {
    throw new MigrationStructureError(
      `${filename} declares data-loss=${dataLoss}, expected one of ${DATA_LOSS_VALUES.join(', ')}`,
    );
  }

  return {
    reversibility: reversibility === undefined ? null : (reversibility as MigrationReversibility),
    dataLoss: dataLoss === undefined ? null : (dataLoss as MigrationDataLoss),
    reason: reasonMatch === null ? null : (reasonMatch[1] as string).trim(),
  };
}

export function parseDownScript(filename: string, content: string, absolutePath: string): DownScript {
  if (!filename.endsWith(DOWN_SCRIPT_SUFFIX)) {
    throw new MigrationStructureError(
      `Down script ${filename} must be named NNNN_snake_case_name${DOWN_SCRIPT_SUFFIX}`,
    );
  }
  const { id } = parseMigrationId(`${filename.slice(0, -DOWN_SCRIPT_SUFFIX.length)}.sql`);
  const header = parseDownHeader(content, filename);
  const reversibility = header.reversibility ?? 'irreversible';
  const reason =
    header.reason ??
    (header.reversibility === null
      ? `no "${DOWN_HEADER_PATTERN.source}" header found, so the author never declared a rollback plan`
      : 'the author declared no reason');

  return {
    id,
    filename,
    absolutePath,
    reversibility,
    dataLoss: header.dataLoss ?? (reversibility === 'reversible' ? 'none' : 'rows'),
    reason,
    statements: splitSqlStatements(content),
  };
}

export function discoverDownScripts(directory: string): Map<string, DownScript> {
  const downDir = join(directory, DOWN_SCRIPT_DIR);
  const scripts = new Map<string, DownScript>();

  if (!isDirectory(downDir)) {
    return scripts;
  }

  for (const filename of readdirSync(downDir)
    .filter((entry) => entry.endsWith(DOWN_SCRIPT_SUFFIX))
    .sort()) {
    const absolutePath = join(downDir, filename);
    const script = parseDownScript(filename, readFileSync(absolutePath, 'utf-8'), absolutePath);
    if (scripts.has(script.id)) {
      throw new MigrationStructureError(`Duplicate down script for migration ${script.id} in ${downDir}`, script.id);
    }
    scripts.set(script.id, script);
  }

  return scripts;
}
