import 'reflect-metadata';
import { beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';

import { db } from '../db/index.ts';
import { runMigrations } from '../db/migrations/migration-runner.ts';

beforeAll(async () => {
  try {
    await db.execute(sql.raw('SELECT 1'));
    await db.execute(sql.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'));

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`
        DO $$
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
        END
        $$;
      `));
    });

    await runMigrations();
  } catch {
    // ignore
  }
});
