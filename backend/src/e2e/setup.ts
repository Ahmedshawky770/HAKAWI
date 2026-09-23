import 'reflect-metadata';
import { beforeAll, afterAll, afterEach } from 'vitest';
import { sql } from 'drizzle-orm';

import { db } from '../db/index.ts';
import { users } from '../db/schema/users.schema.ts';

let databaseAvailable = false;

beforeAll(async () => {
  try {
    await db.execute(sql.raw('SELECT 1'));
    databaseAvailable = true;
    await db.execute(sql.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'));
  } catch {
    databaseAvailable = false;
  }
});

afterEach(async () => {
  if (databaseAvailable) {
    try {
      await db.delete(users).where(sql`1=1`);
    } catch {
      // ignore cleanup errors
    }
  }
});

afterAll(async () => {
  if (databaseAvailable) {
    try {
      const pool = (db as unknown as { pool: { end: () => Promise<void> } }).pool;
      if (pool && typeof pool.end === 'function') {
        await pool.end();
      }
    } catch {
      // ignore cleanup errors
    }
  }
});
