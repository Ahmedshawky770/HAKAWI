import { describe, expect, it } from 'vitest';

import { splitSqlStatements } from './sql-statement-splitter.ts';
import { MigrationStructureError } from './migration-errors.ts';

describe('splitSqlStatements', () => {
  it('returns nothing for an empty or comment-only source', () => {
    expect(splitSqlStatements('')).toEqual([]);
    expect(splitSqlStatements('   \n\n  ')).toEqual([]);
    expect(splitSqlStatements('-- just a comment\n-- another one\n')).toEqual([]);
    expect(splitSqlStatements('/* block only */')).toEqual([]);
  });

  it('splits a multi statement file on semicolons', () => {
    const statements = splitSqlStatements(`
      CREATE TABLE a (id int);
      CREATE TABLE b (id int);
      CREATE INDEX i ON a (id);
    `);

    expect(statements).toEqual(['CREATE TABLE a (id int)', 'CREATE TABLE b (id int)', 'CREATE INDEX i ON a (id)']);
  });

  it('ignores drizzle statement breakpoints because they are line comments', () => {
    const statements = splitSqlStatements('CREATE TABLE a (id int);--> statement-breakpoint\nCREATE TABLE b (id int);');

    expect(statements).toEqual(['CREATE TABLE a (id int)', 'CREATE TABLE b (id int)']);
  });

  it('does not split inside a single quoted literal containing a semicolon', () => {
    const statements = splitSqlStatements("INSERT INTO t (a) VALUES ('x;y'); SELECT 1;");

    expect(statements).toEqual(["INSERT INTO t (a) VALUES ('x;y')", 'SELECT 1']);
  });

  it('keeps a doubled quote escape inside a literal', () => {
    const statements = splitSqlStatements("SELECT 'it''s; fine';");

    expect(statements).toEqual(["SELECT 'it''s; fine'"]);
  });

  it('does not split inside a quoted identifier', () => {
    const statements = splitSqlStatements('CREATE TABLE "weird;name" (id int);');

    expect(statements).toEqual(['CREATE TABLE "weird;name" (id int)']);
  });

  it('does not split inside a dollar quoted body', () => {
    const statements = splitSqlStatements(`
      CREATE FUNCTION f() RETURNS int AS $body$ SELECT 1; SELECT 2; $body$ LANGUAGE sql;
      SELECT 3;
    `);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('SELECT 1; SELECT 2;');
    expect(statements[1]).toBe('SELECT 3');
  });

  it('supports a tagged dollar quote', () => {
    const statements = splitSqlStatements('DO $tag$ BEGIN PERFORM 1; END $tag$;');

    expect(statements).toHaveLength(1);
  });

  it('does not split inside a block comment and strips it from the statement', () => {
    const statements = splitSqlStatements('/* a; b */ SELECT 1;');

    expect(statements).toEqual(['SELECT 1']);
  });

  it('strips line comments so both statement styles produce identical text', () => {
    expect(splitSqlStatements('SELECT 1; -- note\nSELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
    expect(splitSqlStatements('/* note */ SELECT 1;')).toEqual(['SELECT 1']);
  });

  it('keeps comment-like text that is inside a string literal', () => {
    expect(splitSqlStatements("SELECT '-- not a comment', '/* nor this */';")).toEqual([
      "SELECT '-- not a comment', '/* nor this */'",
    ]);
  });

  it('handles nested block comments', () => {
    const statements = splitSqlStatements('/* outer /* inner; */ still; */ SELECT 1;');

    expect(statements).toEqual(['SELECT 1']);
  });

  it('does not treat a semicolon inside a line comment as a terminator', () => {
    const statements = splitSqlStatements('SELECT 1; -- trailing; comment\nSELECT 2;');

    expect(statements).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('tolerates a missing trailing semicolon', () => {
    expect(splitSqlStatements('SELECT 1')).toEqual(['SELECT 1']);
  });

  it('rejects an unterminated string literal', () => {
    expect(() => splitSqlStatements("SELECT 'unterminated")).toThrow(MigrationStructureError);
  });

  it('rejects an unterminated quoted identifier', () => {
    expect(() => splitSqlStatements('SELECT "unterminated')).toThrow(/quoted identifier/);
  });

  it('rejects an unterminated block comment', () => {
    expect(() => splitSqlStatements('SELECT 1 /* unterminated')).toThrow(/block comment/);
  });

  it('rejects an unterminated dollar quote', () => {
    expect(() => splitSqlStatements('SELECT $$unterminated')).toThrow(/dollar-quoted/);
  });
});

describe('splitSqlStatements against the real migration corpus', () => {
  it('splits every checked-in migration and every down script without a single parse error', async () => {
    const { defaultMigrationsDir, discoverDownScripts, discoverMigrationFiles } =
      await import('./migration-discovery.ts');
    const files = discoverMigrationFiles(defaultMigrationsDir());
    const downScripts = discoverDownScripts(defaultMigrationsDir());

    expect(files.length).toBeGreaterThanOrEqual(17);
    for (const file of files) {
      expect(file.statements.length).toBeGreaterThan(0);
      for (const statement of file.statements) {
        expect(statement.endsWith(';')).toBe(false);
      }
    }
    for (const script of downScripts.values()) {
      if (script.reversibility !== 'irreversible') {
        expect(script.statements.length).toBeGreaterThan(0);
      }
    }
  });

  it('splits the two statement styles identically when written on one line', () => {
    const withBreakpoint = 'CREATE TABLE a (id int);--> statement-breakpoint\nCREATE TABLE b (id int);';
    const withSemicolons = 'CREATE TABLE a (id int); CREATE TABLE b (id int);';

    expect(splitSqlStatements(withBreakpoint)).toEqual(splitSqlStatements(withSemicolons));
  });
});
