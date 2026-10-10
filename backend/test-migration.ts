import { discoverMigrationFiles, defaultMigrationsDir } from './src/db/migrations/migration-discovery.ts';
import { readActiveLedger } from './src/db/migrations/migration-ledger.ts';
import { getDatabase } from './src/db/migrations/migration-executor.ts';

async function main() {
  const files = discoverMigrationFiles(defaultMigrationsDir());
  console.log('Total files:', files.length);

  const db = getDatabase();
  const active = await readActiveLedger(db);
  console.log('Active migrations:', active.map(r => r.migrationId));

  for (const file of files) {
    if (active.some((row) => row.migrationId === file.id)) {
      console.log('SKIP:', file.id);
    } else {
      console.log('WOULD APPLY:', file.id);
    }
  }

  await db.close();
}

main();
