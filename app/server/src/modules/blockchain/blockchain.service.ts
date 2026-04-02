import { queryOne } from '../../shared/db/index.js';
import { getSolanaService } from '../../services/solana/instance.js';
import type { SolanaAgreement } from '../../services/solana/ISolanaService.js';
import type { DbContract } from '../../shared/types/index.js';
import { AppError } from '../../shared/utils/errors.js';
import { env } from '../../config/env.js';

function explorerQueryFromRpc(rpcUrl: string): string {
  const rpc = rpcUrl.toLowerCase();
  if (rpc.includes('devnet')) return 'cluster=devnet';
  if (rpc.includes('testnet')) return 'cluster=testnet';
  if (rpc.includes('mainnet') || rpc.includes('mainnet-beta')) return 'cluster=mainnet-beta';
  return `cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
}

export interface BlockchainContractState {
  pda_address: string | null;
  init_tx: string | null;
  explorer_url: string | null;
  on_chain: SolanaAgreement | null;
  solana_available: boolean;
}

export async function getContractBlockchainState(
  contractId: string,
  requesterId: string,
): Promise<BlockchainContractState> {
  const contract = await queryOne<DbContract>(
    `SELECT id, landlord_id, tenant_id, solana_pda, solana_tx_init FROM contracts WHERE id = $1`,
    [contractId],
  );

  if (!contract) throw AppError.notFound('Contract not found.');
  if (requesterId !== contract.landlord_id && requesterId !== contract.tenant_id) {
    throw AppError.forbidden('Access denied.');
  }

  const pdaAddress = contract.solana_pda ?? null;
  const initTx = contract.solana_tx_init ?? null;
  const explorerUrl = pdaAddress
    ? `https://explorer.solana.com/address/${pdaAddress}?${explorerQueryFromRpc(env.SOLANA_RPC_URL)}`
    : null;

  let onChain: SolanaAgreement | null = null;
  let solanaAvailable = false;

  if (pdaAddress) {
    try {
      onChain = await getSolanaService().getAgreement(contractId);
      solanaAvailable = true;
    } catch (err) {
      console.error(`[Solana] getAgreement failed for ${contractId}:`, err);
    }
  }

  return {
    pda_address: pdaAddress,
    init_tx: initTx,
    explorer_url: explorerUrl,
    on_chain: onChain,
    solana_available: solanaAvailable,
  };
}
