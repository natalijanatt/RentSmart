#!/usr/bin/env node
/**
 * Migration runner.
 * Usage: npx tsx src/shared/db/migrate.ts
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';

const { Pool } = pg;

const MIGRATIONS: { name: string; file: string }[] = [
  {
    name: '001_initial',
    file: resolve(__dirname, 'migrations/001_initial.sql'),
  },
  {
    name: '002_rent_payments',
    file: resolve(__dirname, 'migrations/002_rent_payments.sql'),
  },
  {
    name: '002_seed_test_data',
    file: resolve(__dirname, 'migrations/002_seed_test_data.sql'),
  },
  {
    name: '003_remove_pending_acceptance',
    file: resolve(__dirname, 'migrations/003_remove_pending_acceptance.sql'),
  },
  {
    name: '004_restore_pending_acceptance',
    file: resolve(__dirname, 'migrations/004_restore_pending_acceptance.sql'),
  },
  {
    name: '005_backfill_mock_wallets',
    file: resolve(__dirname, 'migrations/005_backfill_mock_wallets.sql'),
  },
];

async function run(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('❌  DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ  DEFAULT NOW()
      )
    `);

    for (const migration of MIGRATIONS) {
      const { rows } = await client.query<{ name: string }>(
        'SELECT name FROM _migrations WHERE name = $1',
        [migration.name],
      );

      if (rows.length > 0) {
        console.log(`⏭   ${migration.name} — already applied, skipping`);
        continue;
      }

      console.log(`▶   Applying ${migration.name}…`);
      const sql = readFileSync(migration.file, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [migration.name],
        );
        await client.query('COMMIT');
        console.log(`✅  ${migration.name} applied`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('Migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('❌  Migration failed:', err);
  process.exit(1);
});
