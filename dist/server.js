"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const diagnosis_1 = __importDefault(require("./routes/diagnosis"));
const history_1 = __importDefault(require("./routes/history"));
const symptoms_1 = __importDefault(require("./routes/symptoms"));
const initDb_1 = require("./scripts/initDb");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT ?? '4000', 10);
// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json());
// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/diagnosis', diagnosis_1.default);
app.use('/api/history', history_1.default);
app.use('/api/symptoms', symptoms_1.default);
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'medicheck-system', timestamp: new Date().toISOString() });
});
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// ---------------------------------------------------------------------------
// Start — run DB migration first, then open the port
// ---------------------------------------------------------------------------
(0, initDb_1.initDb)()
    .then(() => {
    app.listen(PORT, () => {
        console.log(`[MediCheck] Server running on http://localhost:${PORT}`);
        console.log(`[MediCheck] Endpoints:`);
        console.log(`  GET  /health`);
        console.log(`  GET  /api/symptoms`);
        console.log(`  POST /api/diagnosis`);
        console.log(`  GET  /api/history/:sessionId`);
    });
})
    .catch((err) => {
    console.error('[MediCheck] Startup failed — could not initialise database:', err.message);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=server.js.map