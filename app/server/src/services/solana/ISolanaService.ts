/**
 * ISolanaService — server-side copy of the blockchain module's interface contract.
 *
 * IMPORTANT: This is a copy. The source of truth is:
 *   app/blockchain/client/src/interface.ts
 *
 * If the blockchain developer changes a method signature there, update this file
 * and MockSolanaService.ts accordingly. TypeScript will catch mismatches at integration time.
 */

export interface SolanaInitResult {
  tx_signature: string;
  pda_address: string;
  explorer_url: string;
}

export interface SolanaSettlementResult {
  tx_signature: string;
  explorer_url: string;
}

export interface SolanaAgreement {
  contract_id: string;
  contract_hash: string;        // hex string
  deposit_lamports: number;
  landlord: string;             // base58 pubkey
  tenant: string;               // base58 pubkey
  state: 'Created' | 'DepositLocked' | 'CheckinRecorded' | 'CheckoutRecorded' | 'Settled';
  checkin_hash: string;         // hex string
  checkout_hash: string;        // hex string
  settlement_hash: string;      // hex string
  created_at: number;           // Unix timestamp of contract initialization
  explorer_url: string;         // Solana Explorer URL for the PDA account
}

export interface ISolanaService {
  /** Derive the PDA address for a contract without hitting the network. */
  findPDA(contractId: string): { pda: string; bump: number };

  /**
   * Called on POST /contracts.
   * Creates the on-chain PDA, stores contract hash and deposit amount.
   */
  initializeContract(
    contractId: string,
    contractHash: Buffer,
    depositLamports: number,
    landlordPubkey: string,
  ): Promise<SolanaInitResult>;

  /**
   * Called on POST /contracts/:id/accept.
   * Builds an unsigned transaction for the tenant to sign on their device.
   */
  buildLockDepositTx(
    contractId: string,
    tenantPubkey: string,
  ): Promise<{ serialized_tx: string }>;

  /**
   * Called on POST /contracts/:id/checkin/approve.
   * Records the SHA-256 of all check-in image hashes on-chain.
   */
  recordCheckin(
    contractId: string,
    imageHash: Buffer,
    landlordPubkey: string,
  ): Promise<{ tx_signature: string }>;

  /**
   * Called on POST /contracts/:id/checkout/approve.
   * Records the SHA-256 of all check-out image hashes on-chain.
   */
  recordCheckout(
    contractId: string,
    imageHash: Buffer,
    tenantPubkey: string,
  ): Promise<{ tx_signature: string }>;

  /**
 * Called when the second settlement approval is recorded and the contract
 * transitions from settlement to completed.
 * Releases escrowed SOL to tenant and landlord per the rule engine settlement.
   */
  executeSettlement(
    contractId: string,
    settlementHash: Buffer,
    tenantAmount: number,
    landlordAmount: number,
    tenantPubkey: string,
    landlordPubkey: string,
  ): Promise<SolanaSettlementResult>;

  /** Read the current on-chain state of a contract. Returns null if not found. */
  getAgreement(contractId: string): Promise<SolanaAgreement | null>;

  /** Compute SHA-256 of all image hashes concatenated — used before recordCheckin/Checkout. */
  hashImages(imageHashes: string[]): Buffer;

  /** Convert EUR amount to lamports using EUR_SOL_RATE env variable. */
  eurToLamports(eurAmount: number): number;
}
