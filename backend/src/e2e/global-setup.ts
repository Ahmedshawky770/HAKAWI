import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import {
  TEST_DATABASE_RUN_ID_ENV,
  TEST_DATABASE_TEMPLATE_ENV,
  TestInfrastructureError,
  assertPostgresReachable,
  createEmptyDatabase,
  createRunId,
  dropRunDatabases,
  readPostgresSettings,
  reapStaleTestDatabases,
  testDatabaseNameForRun,
} from '../test/helpers/test-database.ts';
import type { PostgresConnectionSettings } from '../test/helpers/test-database.ts';

interface PreparedTemplate {
  readonly runId: string;
  readonly settings: PostgresConnectionSettings;
}

const BUILDER_SCRIPT = fileURLToPath(new URL('./build-template-database.ts', import.meta.url));
const BUILDER_CWD = dirname(dirname(dirname(BUILDER_SCRIPT)));
const BUILDER_TIMEOUT_MS = 300000;
const BUILDER_ATTEMPTS = 3;
const STALE_DATABASE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

let prepared: PreparedTemplate | null = null;

function runTemplateBuilder(templateName: string, settings: PostgresConnectionSettings): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--import', 'tsx', BUILDER_SCRIPT, templateName], {
      cwd: BUILDER_CWD,
      env: {
        ...process.env,
        DB_NAME: templateName,
        DB_HOST: settings.host,
        DB_PORT: String(settings.port),
        DB_USER: settings.user,
        DB_PASSWORD: settings.password,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectPromise(
        new TestInfrastructureError(
          'template-build-timeout',
          `Building the e2e template database "${templateName}" timed out after ${BUILDER_TIMEOUT_MS}ms. Last output: ${stderr || stdout}`,
        ),
      );
    }, BUILDER_TIMEOUT_MS);

    child.on('error', (error: Error) => {
      clearTimeout(timer);
      rejectPromise(
        new TestInfrastructureError(
          'template-build-spawn-failed',
          `Could not start the e2e template builder (${BUILDER_SCRIPT}): ${error.message}. The suite needs tsx to be installed in the workspace.`,
          { cause: error },
        ),
      );
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new TestInfrastructureError(
          'template-build-failed',
          `Building the e2e template database "${templateName}" failed with exit code ${String(code)}. Migrations run in a child process so that the template is left with no open connections. Output:\n${stdout}\n${stderr}`,
        ),
      );
    });
  });
}

async function buildTemplateWithRetries(settings: PostgresConnectionSettings, templateName: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= BUILDER_ATTEMPTS; attempt += 1) {
    await createEmptyDatabase(settings, templateName);
    try {
      await runTemplateBuilder(templateName, settings);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new TestInfrastructureError(
    'template-build-failed',
    `Could not build the e2e template database "${templateName}" after ${BUILDER_ATTEMPTS} attempts. ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    { cause: lastError },
  );
}

export async function setup(): Promise<void> {
  const settings = readPostgresSettings();
  await assertPostgresReachable(settings);
  await reapStaleTestDatabases(settings, STALE_DATABASE_MAX_AGE_MS);

  const runId = createRunId();
  const templateName = testDatabaseNameForRun(runId);

  prepared = { runId, settings };
  await buildTemplateWithRetries(settings, templateName);

  process.env[TEST_DATABASE_RUN_ID_ENV] = runId;
  process.env[TEST_DATABASE_TEMPLATE_ENV] = templateName;
}

export async function teardown(): Promise<void> {
  if (prepared === null) {
    return;
  }
  const { runId, settings } = prepared;
  prepared = null;
  await dropRunDatabases(settings, runId);
}
