import type { ISolanaService } from './ISolanaService.js';

export type { ISolanaService, SolanaAgreement, SolanaInitResult, SolanaRentPaymentTxResult, SolanaSettlementResult } from './ISolanaService.js';

/**
 * Factory: instantiates the real SolanaService from @rentsmart/blockchain.
 * Blockchain is MANDATORY — the server will refuse to start if env vars are missing
 * or the blockchain package is unavailable.
 *
 * Required env variables:
 *   SOLANA_PROGRAM_ID         — base58 program ID from `anchor deploy`
 *   SOLANA_AUTHORITY_KEYPAIR  — JSON array of 64 bytes (authority keypair)
 *   SOLANA_RPC_URL            — RPC endpoint (defaults to devnet if omitted)
 *   PLATFORM_SOLANA_PUBKEY    — platform wallet that receives rent payment fees
 */
export async function createSolanaService(): Promise<ISolanaService> {
  const { SolanaService } = (await import('@rentsmart/blockchain')) as {
    SolanaService: new () => ISolanaService;
  };
  const service = new SolanaService();
  console.log('[Solana] SolanaService initialized from @rentsmart/blockchain');
  return service;
}
