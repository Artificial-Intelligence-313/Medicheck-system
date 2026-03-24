import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Resolve from project root so this works both from src/ (ts-node) and dist/ (node)
const SQL_PATH = path.resolve(process.cwd(), 'src/models/schema.sql');

async function initDb(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const sql = readFileSync(SQL_PATH, 'utf8');
    await pool.query(sql);
    console.log('✓ Database initialised successfully.');
    console.log('  Tables: diagnoses, symptoms_catalog');
    console.log('  Symptoms catalog seeded with all 22 symptoms.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('ERROR: Database init failed:', message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDb();
