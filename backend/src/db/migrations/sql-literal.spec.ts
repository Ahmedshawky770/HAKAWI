import { describe, expect, it } from 'vitest';

import { quoteSqlIdentifier, quoteSqlInteger, quoteSqlText } from './sql-literal.ts';
import { MigrationStructureError } from './migration-errors.ts';

describe('quoteSqlIdentifier', () => {
  it('double quotes a plain identifier', () => {
    expect(quoteSqlIdentifier('drizzle_migrations')).toBe('"drizzle_migrations"');
    expect(quoteSqlIdentifier('_leading_underscore1')).toBe('"_leading_underscore1"');
  });

  it('refuses anything that is not a plain identifier so no injection can reach the SQL text', () => {
    const hostile = [
      'users"; DROP TABLE users; --',
      'users; DROP TABLE users',
      'two words',
      '1leading_digit',
      '',
      'has-dash',
      'quote"inside',
      'semi;colon',
    ];

    for (const value of hostile) {
      expect(() => quoteSqlIdentifier(value)).toThrow(MigrationStructureError);
    }
  });
});

describe('quoteSqlText', () => {
  it('wraps a plain value in single quotes', () => {
    expect(quoteSqlText('0000_create_users_table')).toBe("'0000_create_users_table'");
  });

  it('doubles embedded single quotes so a quote cannot terminate the literal', () => {
    expect(quoteSqlText("O'Brien")).toBe("'O''Brien'");
    expect(quoteSqlText("'; DROP TABLE users; --")).toBe("'''; DROP TABLE users; --'");
    expect(quoteSqlText("''")).toBe("''''''");
  });

  it('neutralises the classic injection payload', () => {
    const escaped = quoteSqlText("x'; DELETE FROM drizzle_migrations WHERE '1'='1");

    expect(escaped).toBe("'x''; DELETE FROM drizzle_migrations WHERE ''1''=''1'");
    expect(escaped.split("'").length - 1).toBe(10);
  });

  it('refuses a NUL byte', () => {
    expect(() => quoteSqlText('a\0b')).toThrow(/NUL/);
  });
});

describe('quoteSqlInteger', () => {
  it('renders a safe integer', () => {
    expect(quoteSqlInteger(0)).toBe('0');
    expect(quoteSqlInteger(42)).toBe('42');
    expect(quoteSqlInteger(-7)).toBe('-7');
  });

  it('refuses anything that is not a safe integer', () => {
    expect(() => quoteSqlInteger(1.5)).toThrow(MigrationStructureError);
    expect(() => quoteSqlInteger(Number.NaN)).toThrow(MigrationStructureError);
    expect(() => quoteSqlInteger(Number.POSITIVE_INFINITY)).toThrow(MigrationStructureError);
    expect(() => quoteSqlInteger(Number.MAX_SAFE_INTEGER + 2)).toThrow(MigrationStructureError);
  });
});
