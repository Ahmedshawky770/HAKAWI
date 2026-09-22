import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../index.js';
import { sql } from 'drizzle-orm';

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
  const rows = result as unknown as { migration_id: string }[];
  return rows.map((row) => row.migration_id);
}

async function runMigrations() {
  await ensureMigrationsTable();
  const executed = await getExecutedMigrations();
  const migrationsDir = join(process.cwd(), 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const pending = files.filter((file) => !executed.includes(file.replace('.sql', '')));

  if (pending.length === 0) {
    return;
  }

  for (const file of pending) {
    const migrationId = file.replace('.sql', '');
    const sqlContent = readFileSync(join(migrationsDir, file), 'utf-8');
    const statements = sqlContent
      .split('--> statement-breakpoint')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    for (const statement of statements) {
      await db.execute(statement as unknown as Parameters<typeof db.execute>[0]);
    }

    await db.execute(
      sql`INSERT INTO ${sql.identifier(MIGRATIONS_TABLE)} (migration_id) VALUES (${migrationId}) ON CONFLICT (migration_id) DO NOTHING;`,
    );
  }
}

export { runMigrations };
