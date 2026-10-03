import 'reflect-metadata';
import { afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';

import { currentTestDatabase, ensureTestDatabase } from '../test/helpers/test-database-scope.ts';
import { db } from '../db/index.ts';
import { applyPendingMigrations } from '../db/migrations/apply-migrations.ts';
import { ValkeyService } from '../common/services/valkey.service.ts';
import { cleanValkey } from '../test/helpers/test-isolation.util.ts';

export { currentTestDatabase };

let valkeyService: ValkeyService | null = null;

function target(): string {
  return `${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_NAME ?? 'unknown'}`;
}

function bootstrapFailure(stage: string, error: unknown): Error {
  const cause = error instanceof Error ? error : new Error(String(error));
  return new Error(`e2e bootstrap failed during ${stage} for the isolated database ${target()}. ${cause.message}`, {
    cause,
  });
}

beforeAll(async () => {
  try {
    await ensureTestDatabase();
  } catch (error) {
    throw bootstrapFailure('database provisioning', error);
  }

  try {
    await db.execute(sql.raw('SELECT 1'));
  } catch (error) {
    throw bootstrapFailure('the database connectivity check', error);
  }

  try {
    await applyPendingMigrations(db);
  } catch (error) {
    throw bootstrapFailure('migrations', error);
  }

  try {
    valkeyService = new ValkeyService();
    await valkeyService.onModuleInit();
    await cleanValkey(valkeyService);
  } catch (error) {
    throw bootstrapFailure('the valkey bootstrap', error);
  }
});

afterAll(async () => {
  if (valkeyService === null) {
    return;
  }
  await cleanValkey(valkeyService);
  await valkeyService.onModuleDestroy();
  valkeyService = null;
});
