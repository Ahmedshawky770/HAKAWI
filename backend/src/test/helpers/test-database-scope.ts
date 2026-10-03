import {
  TEST_DATABASE_RUN_ID_ENV,
  TEST_DATABASE_TEMPLATE_ENV,
  TestInfrastructureError,
  createDatabaseFromTemplate,
  describeUnreachable,
  readPostgresSettings,
} from './test-database.ts';
import type { PostgresConnectionSettings } from './test-database.ts';

const TEST_FILE_SEQUENCE_ENV = 'HAKAWI_E2E_FILE_SEQUENCE';

export interface TestDatabaseScope {
  readonly runId: string;
  readonly templateName: string;
  readonly databaseName: string;
  readonly settings: PostgresConnectionSettings;
}

function nextSequence(): number {
  const previous = Number.parseInt(process.env[TEST_FILE_SEQUENCE_ENV] ?? '0', 10);
  const next = (Number.isFinite(previous) ? previous : 0) + 1;
  process.env[TEST_FILE_SEQUENCE_ENV] = String(next);
  return next;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new TestInfrastructureError(
      'missing-template',
      `Missing ${name}. The Vitest global setup that prepares the test database template did not run, or this module was loaded outside the Vitest e2e project. Run the suite with "npx vitest run --config ./vitest.config.e2e.ts".`,
    );
  }
  return value;
}

function buildScope(): TestDatabaseScope {
  const runId = readRequiredEnv(TEST_DATABASE_RUN_ID_ENV);
  const templateName = readRequiredEnv(TEST_DATABASE_TEMPLATE_ENV);
  const sequence = nextSequence();
  return {
    runId,
    templateName,
    databaseName: `hakawi_test_${runId}_p${process.pid}_s${sequence}`,
    settings: readPostgresSettings(),
  };
}

export const currentTestDatabase: TestDatabaseScope = buildScope();

process.env.DB_NAME = currentTestDatabase.databaseName;

export function describeTestDatabaseTarget(): string {
  const { settings, databaseName } = currentTestDatabase;
  return `${settings.host}:${settings.port}/${databaseName}`;
}

export async function ensureTestDatabase(): Promise<void> {
  const { settings, templateName, databaseName } = currentTestDatabase;
  try {
    await createDatabaseFromTemplate(settings, templateName, databaseName);
  } catch (error) {
    throw new TestInfrastructureError(
      'test-database-unavailable',
      `Could not provision the isolated database "${databaseName}" for this test file from template "${templateName}": ${describeUnreachable(settings, error)}`,
      { cause: error },
    );
  }
}
