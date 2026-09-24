import 'reflect-metadata';
import { beforeAll, afterAll } from 'vitest';
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

afterAll(async () => {
  try {
    await db.delete(users).where(sql`email LIKE '%-int@example.com' OR email LIKE '%-register@example.com' OR email LIKE '%-login@example.com' OR email LIKE '%-session@example.com' OR email LIKE '%-forgot@example.com' OR email LIKE '%-reset@example.com' OR email LIKE '%-e2e@example.com'`);
  } catch {
    // ignore cleanup errors
  }
});
