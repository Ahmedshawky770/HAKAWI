import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

import { sql } from 'drizzle-orm';

import { db } from '../index.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '../../../../migrations');

const MIGRATIONS_TABLE = 'drizzle_migrations';

async function ensureMigrationsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(MIGRATIONS_TABLE)} (
      id SERIAL PRIMARY KEY,
      migration_id VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);
}

async function getExecutedMigrations(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT migration_id FROM ${sql.identifier(MIGRATIONS_TABLE)} ORDER BY migration_id ASC;
  `);
  const rows = result.rows as { migration_id: string }[];
  return rows.map((row) => row.migration_id);
}

async function runMigrations() {
  const logger = new WinstonLoggerService();
  logger.log('Running migrations...');

  await ensureMigrationsTable();
  const executed = await getExecutedMigrations();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const pending = files.filter((file) => !executed.includes(file.replace('.sql', '')));

  if (pending.length === 0) {
    logger.log('No pending migrations');
    return;
  }

  for (const file of pending) {
    const migrationId = file.replace('.sql', '');
    const sqlContent = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const statements = sqlContent
      .split('--> statement-breakpoint')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }

    await db.execute(
      sql`INSERT INTO ${sql.identifier(MIGRATIONS_TABLE)} (migration_id) VALUES (${migrationId}) ON CONFLICT (migration_id) DO NOTHING;`,
    );

    logger.log(`Migration completed: ${migrationId}`);
  }
}

export { runMigrations };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().then(() => process.exit(0)).catch((error) => {
    const logger = new WinstonLoggerService();
    logger.error('Migration error', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
}
