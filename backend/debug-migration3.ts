import { sql } from 'drizzle-orm';
import db from './src/db/index.ts';

async function main() {
  const result = await db.execute(sql.raw('SHOW search_path;'));
  console.log('Node search_path:', result.rows[0]);
  
  // Also check if there are multiple schemas
  const schemas = await db.execute(sql.raw("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')"));
  console.log('Schemas:', schemas.rows);
  
  // Check tables in each schema
  for (const schema of schemas.rows) {
    const tables = await db.execute(sql.raw(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${schema.schema_name}' AND table_name = 'drizzle_migrations'`));
    if (tables.rows.length > 0) {
      console.log(`Table drizzle_migrations found in schema: ${schema.schema_name}`);
      const rows = await db.execute(sql.raw(`SELECT migration_id, rolled_back_at FROM ${schema.schema_name}.drizzle_migrations ORDER BY id`));
      console.log(`Rows in ${schema.schema_name}.drizzle_migrations:`, rows.rows);
    }
  }
  
  process.exit(0);
}

main();
