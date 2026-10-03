import { MigrationStructureError } from './migration-errors.ts';

const PLAIN_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const NUL = '\0';

export function quoteSqlIdentifier(value: string): string {
  if (!PLAIN_IDENTIFIER.test(value)) {
    throw new MigrationStructureError(`Refusing to build SQL: ${JSON.stringify(value)} is not a plain SQL identifier`);
  }
  return `"${value}"`;
}

export function quoteSqlText(value: string): string {
  if (value.includes(NUL)) {
    throw new MigrationStructureError('Refusing to build SQL: string literal contains a NUL byte');
  }
  return `'${value.replaceAll("'", "''")}'`;
}

export function quoteSqlInteger(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new MigrationStructureError(`Refusing to build SQL: ${String(value)} is not a safe integer`);
  }
  return String(value);
}
