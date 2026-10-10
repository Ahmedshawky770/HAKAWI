import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import { defaultMigrationsDir } from './migration-discovery.ts';
import { createMigrationLogSink } from './migration-executor.ts';
import type { MigrationExecutor } from './migration-executor.ts';
import { MigrationRunner } from './migration-runner.ts';
import type { MigrationRunResult } from './migration-types.ts';

export function createMigrationRunner(
  database: MigrationExecutor,
  logger: WinstonLoggerService = new WinstonLoggerService(),
  migrationsDir: string = defaultMigrationsDir(),
): MigrationRunner {
  return new MigrationRunner(database, migrationsDir, createMigrationLogSink(logger));
}

export async function applyPendingMigrations(
  database: MigrationExecutor,
  logger: WinstonLoggerService = new WinstonLoggerService(),
  migrationsDir: string = defaultMigrationsDir(),
): Promise<MigrationRunResult> {
  return createMigrationRunner(database, logger, migrationsDir).up();
}
