import { Client, DatabaseError } from 'pg';
import type { QueryResult, QueryResultRow } from 'pg';

export const TEST_DATABASE_PREFIX = 'hakawi_test';
export const TEST_DATABASE_RUN_ID_ENV = 'HAKAWI_E2E_RUN_ID';
export const TEST_DATABASE_TEMPLATE_ENV = 'HAKAWI_E2E_TEMPLATE_DB';
export const TEST_DATABASE_ADMIN_ENV = 'HAKAWI_E2E_ADMIN_DB';

const TEMPLATE_CLONE_RETRY_LIMIT = 10;
const TEMPLATE_CLONE_RETRY_DELAY_MS = 250;
const TEMPLATE_SOURCE_BUSY_CODE = '55006';
const INVALID_PASSWORD_CODE = '28P01';
const UNKNOWN_DATABASE_CODE = '3D000';
const INSUFFICIENT_PRIVILEGE_CODE = '42501';
const AUTHORIZATION_CODE = '28000';

const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
]);

export class TestInfrastructureError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TestInfrastructureError';
    this.reason = reason;
  }
}

export interface PostgresConnectionSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  adminDatabase: string;
}

export interface DatabaseNameRow extends QueryResultRow {
  datname: string;
}

export interface CreatedbRow extends QueryResultRow {
  rolcreatedb: boolean;
  rolsuper: boolean;
}

export interface AppliedMigrationRow extends QueryResultRow {
  count: string;
}

function readPort(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 5432;
}

function readErrorCode(error: unknown): string | undefined {
  if (error instanceof DatabaseError) {
    return error.code;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code: unknown = (error as NodeJS.ErrnoException).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function readPostgresSettings(): PostgresConnectionSettings {
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: readPort(process.env.DB_PORT),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    adminDatabase: process.env[TEST_DATABASE_ADMIN_ENV] ?? 'postgres',
  };
}

export function describeConnectionTarget(settings: PostgresConnectionSettings): string {
  return `${settings.host}:${settings.port}/${settings.adminDatabase}`;
}

export function describeUnreachable(settings: PostgresConnectionSettings, error: unknown): string {
  const code = readErrorCode(error);
  const target = describeConnectionTarget(settings);

  if (code === INVALID_PASSWORD_CODE) {
    return `Postgres rejected the credentials for user "${settings.user}" at ${target} (SQLSTATE ${INVALID_PASSWORD_CODE}: invalid_password). Check DB_USER and DB_PASSWORD.`;
  }

  if (code === AUTHORIZATION_CODE) {
    return `Postgres rejected the authorization for user "${settings.user}" at ${target} (SQLSTATE ${AUTHORIZATION_CODE}). Check pg_hba.conf and DB_USER.`;
  }

  if (code === UNKNOWN_DATABASE_CODE) {
    return `Postgres database "${settings.adminDatabase}" does not exist at ${target} (SQLSTATE ${UNKNOWN_DATABASE_CODE}). Set DB_NAME or start the container that provisions it.`;
  }

  if (code === INSUFFICIENT_PRIVILEGE_CODE) {
    return `User "${settings.user}" lacks the privileges required at ${target} (SQLSTATE ${INSUFFICIENT_PRIVILEGE_CODE}).`;
  }

  if (code !== undefined && UNREACHABLE_CODES.has(code)) {
    return `Database unreachable at ${target} — is postgres running? (socket error ${code}: ${toMessage(error)})`;
  }

  return `Database unreachable at ${target} — is postgres running? (${toMessage(error)})`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function connectToAdminDatabase(
  settings: PostgresConnectionSettings,
): Promise<{ client: Client; error: unknown | null }> {
  const client = new Client({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    database: settings.adminDatabase,
    connectionTimeoutMillis: 5000,
  });
  const error: unknown = await client.connect().then(
    () => null,
    (cause: unknown) => cause,
  );
  return { client, error };
}

async function closeQuietly(client: Client): Promise<void> {
  try {
    await client.end();
  } catch {
    return;
  }
}

export async function withAdminClient<T>(
  settings: PostgresConnectionSettings,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const { client, error } = await connectToAdminDatabase(settings);
  if (error !== null) {
    await closeQuietly(client);
    throw new TestInfrastructureError('postgres-unreachable', describeUnreachable(settings, error), {
      cause: error,
    });
  }
  try {
    return await operation(client);
  } finally {
    await closeQuietly(client);
  }
}

export async function assertPostgresReachable(settings: PostgresConnectionSettings): Promise<void> {
  const { client, error } = await connectToAdminDatabase(settings);
  if (error !== null) {
    await closeQuietly(client);
    throw new TestInfrastructureError(
      'postgres-unreachable',
      `${describeUnreachable(settings, error)} Start Postgres (docker compose up -d postgres) or point DB_HOST/DB_PORT/DB_USER/DB_PASSWORD at a running instance.`,
      { cause: error },
    );
  }

  try {
    const result: QueryResult<CreatedbRow> = await client.query<CreatedbRow>(
      'SELECT rolcreatedb, rolsuper FROM pg_roles WHERE rolname = current_user',
    );
    const role = result.rows[0];
    if (role === undefined || (role.rolcreatedb !== true && role.rolsuper !== true)) {
      throw new TestInfrastructureError(
        'missing-createdb-privilege',
        `Database user "${settings.user}" at ${describeConnectionTarget(settings)} cannot create databases. Grant CREATEDB or run the suite with a superuser, because every test file provisions its own database.`,
      );
    }
  } catch (error) {
    if (error instanceof TestInfrastructureError) {
      throw error;
    }
    throw new TestInfrastructureError('postgres-unreachable', describeUnreachable(settings, error), { cause: error });
  } finally {
    await closeQuietly(client);
  }
}

export async function dropDatabaseIfExists(settings: PostgresConnectionSettings, databaseName: string): Promise<void> {
  await withAdminClient(settings, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
  });
}

export async function createEmptyDatabase(settings: PostgresConnectionSettings, databaseName: string): Promise<void> {
  await dropDatabaseIfExists(settings, databaseName);
  await withAdminClient(settings, async (client) => {
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  });
}

async function createDatabaseFromTemplateOnce(
  settings: PostgresConnectionSettings,
  templateName: string,
  databaseName: string,
): Promise<boolean> {
  try {
    await withAdminClient(settings, async (client) => {
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE ${quoteIdentifier(templateName)}`);
    });
    return true;
  } catch (error) {
    if (readErrorCode(error) === TEMPLATE_SOURCE_BUSY_CODE) {
      return false;
    }
    throw new TestInfrastructureError(
      'template-clone-failed',
      `Could not clone test database template "${templateName}" into "${databaseName}": ${toMessage(error)}`,
      { cause: error },
    );
  }
}

export async function createDatabaseFromTemplate(
  settings: PostgresConnectionSettings,
  templateName: string,
  databaseName: string,
): Promise<void> {
  await dropDatabaseIfExists(settings, databaseName);

  for (let attempt = 1; attempt <= TEMPLATE_CLONE_RETRY_LIMIT; attempt += 1) {
    const created = await createDatabaseFromTemplateOnce(settings, templateName, databaseName);
    if (created) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, TEMPLATE_CLONE_RETRY_DELAY_MS * attempt));
  }

  throw new TestInfrastructureError(
    'template-clone-busy',
    `Template database "${templateName}" stayed locked by another connection after ${TEMPLATE_CLONE_RETRY_LIMIT} attempts. Another test run is probably cloning it at the same time; retry the run.`,
  );
}

export async function releaseTemplateConnections(
  settings: PostgresConnectionSettings,
  templateName: string,
): Promise<void> {
  await withAdminClient(settings, async (client) => {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [templateName],
    );
  });
}

export async function listDatabases(settings: PostgresConnectionSettings): Promise<readonly string[]> {
  return withAdminClient(settings, async (client) => {
    const result: QueryResult<DatabaseNameRow> = await client.query<DatabaseNameRow>(
      'SELECT datname FROM pg_database WHERE datistemplate = false',
    );
    return result.rows.map((row) => row.datname);
  });
}

const RUN_ID_TIMESTAMP_LENGTH = 9;
const RUN_DATABASE_NAME_PATTERN = new RegExp(
  `^${TEST_DATABASE_PREFIX}_([0-9a-z]{${RUN_ID_TIMESTAMP_LENGTH},})_(?:p[0-9]+_s[0-9]+|tpl)$`,
);

export function createRunId(createdAt: number = Date.now()): string {
  return createdAt.toString(36).padStart(RUN_ID_TIMESTAMP_LENGTH, '0');
}

export function testDatabaseNameForRun(runId: string): string {
  return `${TEST_DATABASE_PREFIX}_${runId}_tpl`;
}

export function runDatabasePrefix(runId: string): string {
  return `${TEST_DATABASE_PREFIX}_${runId}_p`;
}

function readRunCreatedAt(databaseName: string): number | null {
  const match = RUN_DATABASE_NAME_PATTERN.exec(databaseName);
  const runId = match?.[1];
  if (runId === undefined || runId.length !== RUN_ID_TIMESTAMP_LENGTH) {
    return null;
  }
  const decoded = Number.parseInt(runId, 36);
  return Number.isFinite(decoded) ? decoded : null;
}

export async function dropRunDatabases(
  settings: PostgresConnectionSettings,
  runId: string,
): Promise<readonly string[]> {
  const prefix = runDatabasePrefix(runId);
  const templateName = testDatabaseNameForRun(runId);
  const databases = (await listDatabases(settings)).filter((name) => name.startsWith(prefix) || name === templateName);

  for (const name of databases) {
    await dropDatabaseIfExists(settings, name);
  }

  return databases;
}

export async function reapStaleTestDatabases(
  settings: PostgresConnectionSettings,
  maxAgeMs: number,
): Promise<readonly string[]> {
  const cutoff = Date.now() - maxAgeMs;
  const databases = (await listDatabases(settings)).filter((name) => {
    if (!name.startsWith(`${TEST_DATABASE_PREFIX}_`)) {
      return false;
    }
    const createdAt = readRunCreatedAt(name);
    return createdAt !== null && createdAt < cutoff;
  });

  for (const name of databases) {
    await dropDatabaseIfExists(settings, name);
  }

  return databases;
}
