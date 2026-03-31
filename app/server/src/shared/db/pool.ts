import pg from 'pg';
import { env } from '../../config/env.js';

const { Pool } = pg;

// ── PostgreSQL — for ALL data queries ────────────────────────────────────────

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});
