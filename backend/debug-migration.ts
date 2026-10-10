import { discoverMigrationFiles, defaultMigrationsDir } from './src/db/migrations/migration-discovery.ts';
import { readActiveLedger, ensureLedgerTable, backfillLegacyAppliedAt, adoptLegacyChecksum } from './src/db/migrations/migration-ledger.ts';
import db from './src/db/index.ts';

async function main() {
  const files = discoverMigrationFiles(defaultMigrationsDir());
  console.log('Total files:', files.length);
  console.log('Files:', files.map(f => f.id).join(', '));

  await ensureLedgerTable(db);
  
  const activeBefore = await readActiveLedger(db);
  console.log('Active before adoptLegacyRows:', activeBefore.map(r => r.migrationId));
  
  const backfilled = await backfillLegacyAppliedAt(db);
  console.log('Backfilled:', backfilled);
  
  const activeAfterBackfill = await readActiveLedger(db);
  console.log('Active after backfill:', activeAfterBackfill.map(r => r.migrationId));
  
  const byId = new Map(files.map((file) => [file.id, file]));
  for (const row of activeAfterBackfill) {
    if (row.checksum === '') {
      const file = byId.get(row.migrationId);
      if (file) {
        await adoptLegacyChecksum(db, row.migrationId, file.checksum, file.filename);
        console.log('Adopted checksum for:', row.migrationId);
      }
    }
  }
  
  const activeAfterAdopt = await readActiveLedger(db);
  console.log('Active after adopt:', activeAfterAdopt.map(r => ({id: r.migrationId, checksum: r.checksum.slice(0,12)})));
  
  for (const file of files) {
    if (activeAfterAdopt.some((row) => row.migrationId === file.id)) {
      console.log('SKIP:', file.id);
    } else {
      console.log('WOULD APPLY:', file.id);
    }
  }

  process.exit(0);
}

main();
