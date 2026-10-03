import type { SQL } from 'drizzle-orm';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

export type MigrationQueryResult = {
  readonly rows: readonly unknown[];
};

export type MigrationExecutor = {
  execute(query: SQL): Promise<MigrationQueryResult>;
  transaction<T>(run: (tx: MigrationExecutor) => Promise<T>): Promise<T>;
};

export type MigrationLogSink = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export const MIGRATION_LOG_CONTEXT = 'MigrationRunner';

export function createMigrationLogSink(logger: WinstonLoggerService): MigrationLogSink {
  return {
    info: (message: string): void => {
      logger.info(message, MIGRATION_LOG_CONTEXT);
    },
    warn: (message: string): void => {
      logger.warn(message, MIGRATION_LOG_CONTEXT);
    },
    error: (message: string): void => {
      logger.error(message, undefined, MIGRATION_LOG_CONTEXT);
    },
  };
}

export function readRequiredString(row: unknown, column: string): string {
  const value = readColumn(row, column);
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  throw new TypeError(`Expected column ${column} to hold a string, received ${describeValue(value)}`);
}

export function readRequiredInteger(row: unknown, column: string): number {
  const value = readColumn(row, column);
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  throw new TypeError(`Expected column ${column} to hold an integer, received ${describeValue(value)}`);
}

export function readTimestamp(row: unknown, column: string): Date {
  const value = readColumn(row, column);
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value);
  }
  throw new TypeError(`Expected column ${column} to hold a timestamp, received ${describeValue(value)}`);
}

export function readNullableTimestamp(row: unknown, column: string): Date | null {
  const value = readColumn(row, column);
  if (value === null || value === undefined) {
    return null;
  }
  return readTimestamp(row, column);
}

function readColumn(row: unknown, column: string): unknown {
  if (typeof row !== 'object' || row === null) {
    throw new TypeError(`Expected a result row object, received ${describeValue(row)}`);
  }
  return (row as Record<string, unknown>)[column];
}

function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  return typeof value;
}
