import type { ISolanaService } from './ISolanaService.js';
import { createSolanaService } from './index.js';

let _instance: ISolanaService | null = null;

/**
 * Returns the initialized SolanaService singleton.
 * Must be called after initSolanaService() at startup.
 */
export function getSolanaService(): ISolanaService {
  if (!_instance) {
    throw new Error('[Solana] Service not initialized. initSolanaService() must be called at startup.');
  }
  return _instance;
}

/**
 * Initializes the SolanaService singleton. Called once at server startup.
 * Throws if SOLANA_PROGRAM_ID or SOLANA_AUTHORITY_KEYPAIR are missing or invalid.
 */
export async function initSolanaService(): Promise<void> {
  _instance = await createSolanaService();
}
