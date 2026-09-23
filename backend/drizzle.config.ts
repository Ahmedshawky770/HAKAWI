import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
import { readdirSync } from 'fs';
import { join } from 'path';

config();

const schemaDir = join(process.cwd(), 'src/db/schema');
const schemaFiles = readdirSync(schemaDir)
  .filter((file) => file.endsWith('.schema.ts'))
  .map((file) => join(schemaDir, file));

export default defineConfig({
  schema: schemaFiles,
  out: '../migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'hakawi',
  },
});
