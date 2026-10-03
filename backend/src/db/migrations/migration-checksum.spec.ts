import { describe, expect, it } from 'vitest';

import { computeMigrationChecksum, normalizeMigrationContent } from './migration-checksum.ts';

describe('normalizeMigrationContent', () => {
  it('turns CRLF and lone CR into LF', () => {
    expect(normalizeMigrationContent('a\r\nb\rc')).toBe('a\nb\nc\n');
  });

  it('trims trailing whitespace and guarantees exactly one final newline', () => {
    expect(normalizeMigrationContent('SELECT 1;   \n\n  ')).toBe('SELECT 1;\n');
    expect(normalizeMigrationContent('SELECT 1;\n')).toBe('SELECT 1;\n');
  });

  it('leaves interior blank lines alone', () => {
    expect(normalizeMigrationContent('SELECT 1;\n\n\nSELECT 2;')).toBe('SELECT 1;\n\n\nSELECT 2;\n');
  });
});

describe('computeMigrationChecksum', () => {
  it('returns a 64 character lowercase sha256 hex digest', () => {
    expect(computeMigrationChecksum('SELECT 1;')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across line-ending and trailing-whitespace differences', () => {
    const unix = computeMigrationChecksum('CREATE TABLE a (id int);\nCREATE TABLE b (id int);\n');
    const windows = computeMigrationChecksum('CREATE TABLE a (id int);\r\nCREATE TABLE b (id int);\r\n');
    const padded = computeMigrationChecksum('CREATE TABLE a (id int);\nCREATE TABLE b (id int);\n\n   ');

    expect(windows).toBe(unix);
    expect(padded).toBe(unix);
  });

  it('changes when a single character of SQL changes', () => {
    const original = computeMigrationChecksum('ALTER TABLE users ADD COLUMN email_verified boolean;');
    const tampered = computeMigrationChecksum('ALTER TABLE users ADD COLUMN email_verified boolean ;');

    expect(tampered).not.toBe(original);
  });

  it('changes when only a comment changes, so comment drift is still drift', () => {
    const original = computeMigrationChecksum('-- adds the column\nALTER TABLE users ADD COLUMN a int;');
    const tampered = computeMigrationChecksum('-- ADDS THE COLUMN\nALTER TABLE users ADD COLUMN a int;');

    expect(tampered).not.toBe(original);
  });
});
