import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoverDownScripts,
  discoverMigrationFiles,
  parseDownScript,
  parseMigrationId,
  resolveMigrationsDir,
} from './migration-discovery.ts';
import { MigrationStructureError } from './migration-errors.ts';

describe('parseMigrationId', () => {
  it('accepts the NNNN_snake_case_name.sql convention', () => {
    expect(parseMigrationId('0000_create_users_table.sql')).toEqual({ id: '0000_create_users_table', sequence: 0 });
    expect(parseMigrationId('0016_add_paymob_gateway_fields.sql')).toEqual({
      id: '0016_add_paymob_gateway_fields',
      sequence: 16,
    });
  });

  it('rejects a file that is not .sql', () => {
    expect(() => parseMigrationId('0000_users.txt')).toThrow(/must end with .sql/);
  });

  it('rejects names that are not NNNN_snake_case', () => {
    for (const name of [
      'users.sql',
      '0000_Users.sql',
      '00_users.sql',
      '0000_create-users.sql',
      '0000_create users.sql',
      '0000_.sql',
    ]) {
      expect(() => parseMigrationId(name)).toThrow(MigrationStructureError);
    }
  });
});

describe('discoverMigrationFiles', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'hakawi-discovery-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('returns every migration sorted by id with its checksum and statements', () => {
    writeFileSync(join(workspace, '0000_first.sql'), 'CREATE TABLE a (id int);');
    writeFileSync(join(workspace, '0001_second.sql'), 'CREATE TABLE b (id int);\nCREATE INDEX i ON b (id);');

    const files = discoverMigrationFiles(workspace);

    expect(files.map((file) => file.id)).toEqual(['0000_first', '0001_second']);
    expect(files[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(files[0]?.filename).toBe('0000_first.sql');
    expect(files[1]?.statements).toHaveLength(2);
  });

  it('ignores the down directory and non-sql files', () => {
    mkdirSync(join(workspace, 'down'), { recursive: true });
    writeFileSync(join(workspace, '0000_first.sql'), 'CREATE TABLE a (id int);');
    writeFileSync(join(workspace, 'down', '0000_first.down.sql'), 'DROP TABLE a;');
    writeFileSync(join(workspace, 'README.md'), '# not a migration');

    expect(discoverMigrationFiles(workspace).map((file) => file.filename)).toEqual(['0000_first.sql']);
  });

  it('refuses a directory with no migrations at all', () => {
    expect(() => discoverMigrationFiles(workspace)).toThrow(/No .sql migrations found/);
  });

  it('refuses a migration with no executable statement', () => {
    writeFileSync(join(workspace, '0000_empty.sql'), '-- nothing here\n');

    expect(() => discoverMigrationFiles(workspace)).toThrow(/no executable SQL statement/);
  });

  it('refuses two migrations that claim the same sequence number', () => {
    writeFileSync(join(workspace, '0001_first.sql'), 'SELECT 1;');
    writeFileSync(join(workspace, '0001_second.sql'), 'SELECT 1;');

    expect(() => discoverMigrationFiles(workspace)).toThrow(/Two migrations claim sequence 0001/);
  });
});

describe('resolveMigrationsDir', () => {
  it('honours the HAKAWI_MIGRATIONS_DIR override', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'hakawi-override-'));
    try {
      writeFileSync(join(workspace, '0000_first.sql'), 'SELECT 1;');

      expect(resolveMigrationsDir('/nowhere', { HAKAWI_MIGRATIONS_DIR: workspace })).toBe(workspace);
      expect(() => resolveMigrationsDir('/nowhere', { HAKAWI_MIGRATIONS_DIR: '/definitely/not/here' })).toThrow(
        /contains no .sql migration files/,
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('walks up the tree until it finds a directory that holds migrations', () => {
    const root = mkdtempSync(join(tmpdir(), 'hakawi-walk-'));
    try {
      mkdirSync(join(root, 'migrations'), { recursive: true });
      mkdirSync(join(root, 'a', 'b', 'c'), { recursive: true });
      writeFileSync(join(root, 'migrations', '0000_first.sql'), 'SELECT 1;');

      expect(resolveMigrationsDir(join(root, 'a', 'b', 'c'), {})).toBe(join(root, 'migrations'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loudly when nothing can be found', () => {
    expect(() => resolveMigrationsDir('/tmp', {})).toThrow(/Could not locate the migrations directory/);
  });
});

describe('parseDownScript', () => {
  it('reads reversibility, data loss and reason from the header', () => {
    const script = parseDownScript(
      '0009_create_payments_tables.down.sql',
      '-- hakawi:down reversibility=data-loss data-loss=rows reason=Drops the money ledger.\nDROP TABLE payments;',
      '/tmp/0009_create_payments_tables.down.sql',
    );

    expect(script.id).toBe('0009_create_payments_tables');
    expect(script.reversibility).toBe('data-loss');
    expect(script.dataLoss).toBe('rows');
    expect(script.reason).toBe('Drops the money ledger.');
    expect(script.statements).toEqual(['DROP TABLE payments']);
  });

  it('defaults data-loss to none for a reversible script', () => {
    const script = parseDownScript(
      '0001_probe.down.sql',
      '-- hakawi:down reversibility=reversible reason=Drops an index.\nDROP INDEX i;',
      '/tmp/0001_probe.down.sql',
    );

    expect(script.reversibility).toBe('reversible');
    expect(script.dataLoss).toBe('none');
  });

  it('treats a missing header as an honest refusal rather than a guess', () => {
    const script = parseDownScript('0001_probe.down.sql', 'DROP TABLE a;', '/tmp/0001_probe.down.sql');

    expect(script.reversibility).toBe('irreversible');
    expect(script.reason).toMatch(/never declared a rollback plan/);
  });

  it('treats the generated TBD placeholder as undecided rather than reversible', () => {
    const script = parseDownScript(
      '0017_probe.down.sql',
      '-- hakawi:down reversibility=TBD data-loss=TBD reason=declare the rollback plan before this migration is applied\n-- TODO',
      '/tmp/0017_probe.down.sql',
    );

    expect(script.reversibility).toBe('irreversible');
    expect(script.reason).toContain('declare the rollback plan');
  });

  it('rejects an unknown reversibility value', () => {
    expect(() =>
      parseDownScript('0001_probe.down.sql', '-- hakawi:down reversibility=maybe\nDROP TABLE a;', '/tmp/x'),
    ).toThrow(/expected one of/);
  });

  it('rejects an unknown data-loss value', () => {
    expect(() =>
      parseDownScript('0001_probe.down.sql', '-- hakawi:down data-loss=galaxies\nDROP TABLE a;', '/tmp/x'),
    ).toThrow(/expected one of/);
  });

  it('rejects a down script that is not named NNNN_name.down.sql', () => {
    expect(() => parseDownScript('0001_probe.sql', 'DROP TABLE a;', '/tmp/x')).toThrow(/must be named/);
    expect(() => parseDownScript('probe.down.sql', 'DROP TABLE a;', '/tmp/x')).toThrow(
      /does not follow the required NNNN_snake_case_name.sql convention/,
    );
  });
});

describe('discoverDownScripts', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'hakawi-down-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('returns an empty map when there is no down directory', () => {
    expect(discoverDownScripts(workspace).size).toBe(0);
  });

  it('indexes every down script by migration id', () => {
    mkdirSync(join(workspace, 'down'), { recursive: true });
    writeFileSync(join(workspace, '0000_first.sql'), 'SELECT 1;');
    writeFileSync(join(workspace, 'down', '0000_first.down.sql'), '-- hakawi:down reversibility=reversible\nSELECT 2;');

    const scripts = discoverDownScripts(workspace);

    expect(scripts.has('0000_first')).toBe(true);
    expect(scripts.get('0000_first')?.reversibility).toBe('reversible');
  });

  it('indexes scripts independently of file name so a suffixed variant is a different migration', () => {
    mkdirSync(join(workspace, 'down'), { recursive: true });
    writeFileSync(join(workspace, 'down', '0000_first.down.sql'), 'SELECT 2;');
    writeFileSync(join(workspace, 'down', '0000_first_extra.down.sql'), 'SELECT 3;');

    expect([...discoverDownScripts(workspace).keys()]).toEqual(['0000_first', '0000_first_extra']);
  });
});
