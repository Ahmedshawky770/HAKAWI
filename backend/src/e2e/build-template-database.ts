async function applyMigrations(): Promise<void> {
  const { applyPendingMigrations } = await import('../db/migrations/apply-migrations.ts');
  const { db } = await import('../db/index.ts');
  await applyPendingMigrations(db);
  const { withAdminClient, readPostgresSettings } = await import('../test/helpers/test-database.ts');
  await withAdminClient(readPostgresSettings(), async (client) => {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  });
}

async function main(): Promise<void> {
  const databaseName = process.argv[2];
  if (databaseName === undefined || databaseName.length === 0) {
    process.stderr.write('build-template-database: missing target database name\n');
    process.exit(2);
  }

  process.env.DB_NAME = databaseName;
  await applyMigrations();
  process.stdout.write(`template ready: ${databaseName}\n`);
  process.exit(0);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`template build failed: ${message}\n`);
  process.exit(1);
});
