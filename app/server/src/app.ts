import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { pool } from './shared/db/index.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { contractsRouter } from './modules/contracts/contracts.routes.js';
import { inspectionsRouter } from './modules/inspections/inspections.routes.js';
import { analysisRouter } from './modules/analysis/analysis.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';

export const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/contracts', contractsRouter);
app.use('/api/v1/contracts', inspectionsRouter);
app.use('/api/v1/contracts', analysisRouter);
app.use('/api/v1/contracts', auditRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);
