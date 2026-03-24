"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDb = initDb;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Works from both src/ (ts-node) and dist/ (node) since cwd is always the project root
const SQL_PATH = path_1.default.resolve(process.cwd(), 'src/models/schema.sql');
async function initDb() {
    if (!process.env.DATABASE_URL) {
        console.error('ERROR: DATABASE_URL is not set.');
        process.exit(1);
    }
    const pool = new pg_1.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    try {
        const sql = (0, fs_1.readFileSync)(SQL_PATH, 'utf8');
        await pool.query(sql);
        console.log('[MediCheck] Database initialised — tables and seed data ready.');
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[MediCheck] Database init failed:', message);
        throw err;
    }
    finally {
        await pool.end();
    }
}
// Auto-run when executed directly: ts-node src/scripts/initDb.ts  or  node dist/scripts/initDb.js
if (require.main === module) {
    initDb().catch(() => process.exit(1));
}
//# sourceMappingURL=initDb.js.map