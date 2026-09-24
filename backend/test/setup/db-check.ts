import { describe, beforeAll } from 'vitest';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '5432';
const DB_NAME = process.env.DB_NAME || 'hakawi';

let dbAvailable = false;

beforeAll(async () => {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: DB_HOST,
      port: Number(DB_PORT),
      database: DB_NAME,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    await pool.query('SELECT 1');
    await pool.end();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
});

export const skipIfNoDb = () => {
  if (!dbAvailable) {
    describe.skip?.('') || beforeAll(() => {});
  }
};

export { dbAvailable };
