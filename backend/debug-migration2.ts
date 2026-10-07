import { sql } from 'drizzle-orm';
import { discoverMigrationFiles, defaultMigrationsDir } from './src/db/migrations/migration-discovery.ts';
import { readActiveLedger, ensureLedgerTable, backfillLegacyAppliedAt, adoptLegacyChecksum } from './src/db/migrations/migration-ledger.ts';
import db from './src/db/index.ts';

async function main() {
  // Check database connection
  const result = await db.execute(sql.raw('SELECT current_database(), current_user, inet_server_addr(), inet_server_port()'));
  console.log('DB Connection:', result.rows[0]);
  
  const files = discoverMigrationFiles(defaultMigrationsDir());
  console.log('Total files:', files.length);

  await ensureLedgerTable(db);
  
  const activeBefore = await readActiveLedger(db);
  console.log('Active before adoptLegacyRows:', activeBefore.map(r => r.migrationId));
  
  // Also check the raw ledger table
  const raw = await db.execute(sql.raw('SELECT migration_id, rolled_back_at FROM drizzle_migrations ORDER BY id'));
  console.log('Raw ledger:', raw.rows);

  process.exit(0);
}

main();
