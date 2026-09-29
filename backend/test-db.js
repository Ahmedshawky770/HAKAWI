require('dotenv/config');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'hakawi',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function test() {
  const email = 'test-cleanup-' + Date.now() + '@example.com';
  
  const insertRes = await pool.query('INSERT INTO users (id, username, email, name, account_type) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id, email', ['testuser' + Date.now(), email, 'Test', 'reader']);
  console.log('Inserted:', insertRes.rows[0]);
  
  const countRes = await pool.query('SELECT count(*) FROM users WHERE email = $1', [email]);
  console.log('Count after insert:', countRes.rows[0].count);
  
  // Now try the cleanup approach
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { sql } = require('drizzle-orm');
  const db = drizzle(pool);
  
  try {
    const result = await db.execute(sql`SET session_replication_role = replica; DELETE FROM users WHERE email = ${email}; SET session_replication_role = default`);
    console.log('Delete rowCount:', result[1].rowCount);
  } catch (e) {
    console.error('Delete error:', e.message);
  }
  
  const countAfterRes = await pool.query('SELECT count(*) FROM users WHERE email = $1', [email]);
  console.log('Count after delete:', countAfterRes.rows[0].count);
  
  await pool.end();
}

test().catch(e => { console.error(e); process.exit(1); });
