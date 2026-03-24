"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Resolve from project root so this works both from src/ (ts-node) and dist/ (node)
const SQL_PATH = path_1.default.resolve(process.cwd(), 'src/models/schema.sql');
async function initDb() {
    if (!process.env.DATABASE_URL) {
        console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
        process.exit(1);
    }
    const pool = new pg_1.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    try {
        const sql = (0, fs_1.readFileSync)(SQL_PATH, 'utf8');
        await pool.query(sql);
        console.log('✓ Database initialised successfully.');
        console.log('  Tables: diagnoses, symptoms_catalog');
        console.log('  Symptoms catalog seeded with all 22 symptoms.');
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('ERROR: Database init failed:', message);
        process.exit(1);
    }
    finally {
        await pool.end();
    }
}
initDb();
//# sourceMappingURL=initDb.js.map