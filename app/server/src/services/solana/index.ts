import type { ISolanaService } from './ISolanaService';
import { MockSolanaService } from './MockSolanaService';

export type { ISolanaService, SolanaAgreement, SolanaInitResult, SolanaSettlementResult } from './ISolanaService';

/**
 * Factory: returns the real SolanaService when SOLANA_PROGRAM_ID is set and
 * the @rentsmart/blockchain package is installed. Falls back to MockSolanaService otherwise.
 *
 * Usage (create once at app startup, reuse the instance):
 *   import { createSolanaService } from './services/solana';
 *   const solana = createSolanaService();
 *
 * Integration checklist (when blockchain module is ready):
 *   1. Run `npm install` in repo root (npm workspaces links @rentsmart/blockchain)
 *   2. Set SOLANA_PROGRAM_ID, SOLANA_RPC_URL, SOLANA_AUTHORITY_KEYPAIR in .env
 *   3. Restart server — factory will auto-pick up the real implementation
 *   4. Logs change from [MockSolana] to [Solana] prefix
 */
export function createSolanaService(): ISolanaService {
  if (process.env.SOLANA_PROGRAM_ID) {
    try {
      // Dynamic require — @rentsmart/blockchain is an optional dependency.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SolanaService } = require('@rentsmart/blockchain') as {
        SolanaService: new () => ISolanaService;
      };
      console.log('[Solana] Using real SolanaService from @rentsmart/blockchain');
      return new SolanaService();
    } catch (err) {
      console.warn(
        '[Solana] SOLANA_PROGRAM_ID is set but @rentsmart/blockchain is not available.',
        'Run `npm install` in the repo root to link the blockchain package.',
        err,
      );
    }
  }
  console.log('[Solana] SOLANA_PROGRAM_ID not set — using MockSolanaService');
  return new MockSolanaService();
}
