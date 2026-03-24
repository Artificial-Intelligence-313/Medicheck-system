import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Works from both src/ (ts-node) and dist/ (node) since cwd is always the project root
const SQL_PATH = path.resolve(process.cwd(), 'src/models/schema.sql');

export async function initDb(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const sql = readFileSync(SQL_PATH, 'utf8');
    await pool.query(sql);
    console.log('[MediCheck] Database initialised — tables and seed data ready.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[MediCheck] Database init failed:', message);
    throw err;
  } finally {
    await pool.end();
  }
}

// Auto-run when executed directly: ts-node src/scripts/initDb.ts  or  node dist/scripts/initDb.js
if (require.main === module) {
  initDb().catch(() => process.exit(1));
}
