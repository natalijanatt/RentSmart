import './config/env.js';
import { env } from './config/env.js';
import { pool } from './shared/db/index.js';
import { app } from './app.js';
import { initSolanaService } from './services/solana/instance.js';

async function start(): Promise<void> {
  // Verify DB connectivity before accepting traffic
  try {
    await pool.query('SELECT 1');
    console.log('✅  DB connected');
  } catch (err) {
    console.error('❌  DB connection failed:', err);
    process.exit(1);
  }

  // Initialize blockchain service (mandatory — throws if misconfigured)
  try {
    await initSolanaService();
    console.log('✅  Solana blockchain service ready');
  } catch (err) {
    console.error('❌  Solana initialization failed:', err);
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    console.log(`🚀  Server listening on http://localhost:${env.PORT}`);
    console.log(`    NODE_ENV   : ${env.NODE_ENV}`);
    console.log(`    MOCK_AUTH  : ${env.MOCK_AUTH}`);
    console.log(`    MOCK_LLM   : ${env.MOCK_LLM}`);
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
