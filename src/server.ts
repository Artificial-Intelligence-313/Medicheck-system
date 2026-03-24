import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import diagnosisRouter from './routes/diagnosis';
import historyRouter  from './routes/history';
import symptomsRouter from './routes/symptoms';
import { initDb } from './scripts/initDb';

dotenv.config();

const app: Express = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/diagnosis', diagnosisRouter);
app.use('/api/history',   historyRouter);
app.use('/api/symptoms',  symptomsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'medicheck-system', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[MediCheck] Server running on http://localhost:${PORT}`);
  console.log(`[MediCheck] Endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /api/symptoms`);
  console.log(`  POST /api/diagnosis`);
  console.log(`  GET  /api/history/:sessionId`);
});

export default app;
