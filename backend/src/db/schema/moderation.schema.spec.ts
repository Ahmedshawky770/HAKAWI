import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { REPORT_SOURCES, reports } from './moderation.schema.ts';

const MIGRATION_SQL = join(process.cwd(), '..', 'migrations', '0018_add_report_source.sql');

function migrationSql(): string {
  return readFileSync(MIGRATION_SQL, 'utf8');
}

describe('reports table', () => {
  const columns = getTableColumns(reports);

  it('lets an automatic report exist with no reporter', () => {
    expect(columns.reporterId).toBeDefined();
    expect(columns.reporterId.notNull).toBe(false);
  });

  it('records where the report came from', () => {
    expect(columns.source).toBeDefined();
    expect(columns.source.notNull).toBe(true);
    expect(columns.source.hasDefault).toBe(true);
  });

  it('restricts the source to the two values the migration allows', () => {
    expect(REPORT_SOURCES).toEqual(['user', 'auto']);
    expect(columns.source.enumValues).toEqual(['user', 'auto']);
  });

  it('indexes the source column the same way the migration does', () => {
    const names = getTableConfig(reports).indexes.map((index) => index.config.name);

    expect(names).toContain('reports_source_idx');
  });
});

describe('migration 0018', () => {
  it('drops the not null constraint the schema no longer carries', () => {
    expect(migrationSql()).toContain('ALTER COLUMN "reporter_id" DROP NOT NULL');
  });

  it('adds the source column with the same default and nullability the schema declares', () => {
    expect(migrationSql()).toContain('ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT \'user\' NOT NULL');
  });

  it('enforces the same two source values the schema enumerates', () => {
    expect(migrationSql()).toContain("CHECK (\"source\" IN ('user', 'auto'))");
  });

  it('indexes the source column the schema indexes', () => {
    expect(migrationSql()).toContain('CREATE INDEX IF NOT EXISTS "reports_source_idx" ON "reports" ("source")');
  });
});
