import crypto from 'crypto';
import type { ISolanaService, SolanaAgreement, SolanaInitResult, SolanaRentPaymentTxResult, SolanaSettlementResult } from './ISolanaService';

/**
 * MockSolanaService — used when SOLANA_PROGRAM_ID is not set.
 * Allows the server to be developed and tested without a running Solana program.
 *
 * All methods log to console so you can verify they are being called correctly.
 * Return values are deterministic stubs that won't break any server logic.
 */
export class MockSolanaService implements ISolanaService {
  findPDA(contractId: string): { pda: string; bump: number } {
    // Deterministic fake PDA — same input always gives same output
    const hash = crypto.createHash('sha256').update(`mock_pda_${contractId}`).digest('base64url');
    return { pda: hash.slice(0, 44), bump: 255 };
  }

  async initializeContract(
    contractId: string,
    _contractHash: Buffer,
    _depositLamports: number,
    _landlordPubkey: string,
  ): Promise<SolanaInitResult> {
    console.log(`[MockSolana] initializeContract: ${contractId}`);
    return {
      tx_signature: `mock_tx_init_${contractId.slice(0, 8)}`,
      pda_address: this.findPDA(contractId).pda,
      explorer_url: 'https://explorer.solana.com/tx/mock?cluster=devnet',
    };
  }

  async buildLockDepositTx(
    contractId: string,
    _tenantPubkey: string,
  ): Promise<{ serialized_tx: string }> {
    console.log(`[MockSolana] buildLockDepositTx: ${contractId}`);
    return { serialized_tx: `mock_serialized_tx_${contractId.slice(0, 8)}` };
  }

  async recordCheckin(
    contractId: string,
    _imageHash: Buffer,
    _landlordPubkey: string,
  ): Promise<{ tx_signature: string }> {
    console.log(`[MockSolana] recordCheckin: ${contractId}`);
    return { tx_signature: `mock_tx_checkin_${contractId.slice(0, 8)}` };
  }

  async recordCheckout(
    contractId: string,
    _imageHash: Buffer,
    _tenantPubkey: string,
  ): Promise<{ tx_signature: string }> {
    console.log(`[MockSolana] recordCheckout: ${contractId}`);
    return { tx_signature: `mock_tx_checkout_${contractId.slice(0, 8)}` };
  }

  async buildPayRentTx(
    contractId: string,
    _tenantPubkey: string,
    _landlordPubkey: string,
    _platformPubkey: string,
    rentLamports: number,
  ): Promise<SolanaRentPaymentTxResult> {
    const feePerSide = Math.floor((rentLamports * 50) / 10_000);
    console.log(`[MockSolana] buildPayRentTx: ${contractId} — rent=${rentLamports}`);
    return {
      serialized_tx: `mock_rent_tx_${contractId.slice(0, 8)}`,
      rent_lamports: rentLamports,
      landlord_amount: rentLamports - feePerSide,
      platform_fee_total: feePerSide * 2,
    };
  }

  async executeSettlement(
    contractId: string,
    _settlementHash: Buffer,
    tenantAmount: number,
    landlordAmount: number,
    _tenantPubkey: string,
    _landlordPubkey: string,
  ): Promise<SolanaSettlementResult> {
    console.log(
      `[MockSolana] executeSettlement: ${contractId} — tenant=${tenantAmount} landlord=${landlordAmount}`,
    );
    return {
      tx_signature: `mock_tx_settle_${contractId.slice(0, 8)}`,
      explorer_url: 'https://explorer.solana.com/tx/mock?cluster=devnet',
    };
  }

  async getAgreement(contractId: string): Promise<SolanaAgreement | null> {
    console.log(`[MockSolana] getAgreement: ${contractId}`);
    const { pda } = this.findPDA(contractId);
    return {
      contract_id: contractId,
      contract_hash: '0'.repeat(64),
      deposit_lamports: 0,
      landlord: '11111111111111111111111111111111',
      tenant: '11111111111111111111111111111111',
      state: 'Created',
      checkin_hash: '0'.repeat(64),
      checkout_hash: '0'.repeat(64),
      settlement_hash: '0'.repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      explorer_url: `https://explorer.solana.com/address/${pda}?cluster=devnet`,
    };
  }

  hashImages(imageHashes: string[]): Buffer {
    return crypto.createHash('sha256').update(imageHashes.join('')).digest();
  }

  eurToLamports(eurAmount: number): number {
    // Mock rate: 1 EUR = 10,000,000 lamports (0.01 SOL)
    return Math.round(eurAmount * 10_000_000);
  }
}
