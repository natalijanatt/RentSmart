/**
 * ISolanaService — contract between the blockchain module and the server.
 *
 * SOURCE OF TRUTH: this file.
 * The server has a copy at: app/server/src/services/solana/ISolanaService.ts
 * If you change a method signature here, update the server copy too and notify
 * the server developer to update MockSolanaService accordingly.
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
  contract_hash: string;          // hex string
  deposit_lamports: number;
  prepaid_rent_lamports: number;  // current pre-paid rent escrow balance
  landlord: string;               // base58 pubkey
  authority: string;              // backend authority pubkey allowed to run privileged ops
  platform_wallet: string;        // platform fee wallet constrained on release instruction
  tenant: string;                 // base58 pubkey
  state: 'Created' | 'DepositLocked' | 'CheckinRecorded' | 'CheckoutRecorded' | 'Settled';
  checkin_hash: string;           // hex string
  checkout_hash: string;          // hex string
  settlement_hash: string;        // hex string
  created_at: number;             // Unix timestamp of contract initialization
  explorer_url: string;           // Solana Explorer URL for the PDA account
}

export interface SolanaTopUpRentTxResult {
  serialized_tx: string;   // base64-encoded unsigned transaction; tenant signs on their device
  amount_lamports: number; // total lamports being deposited into the escrow PDA
  months_covered: number;  // how many months this top-up covers (amount / (rent × 1.005))
  fee_lamports: number;    // tenant's 0.5% platform fee share included per month × months
}

export interface SolanaReleaseRentResult {
  tx_signature: string;
  landlord_amount: number; // rent_lamports * 0.995
  platform_fee: number;    // rent_lamports * 0.01 (1% total)
  explorer_url: string;
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
   * Returns a base64-encoded serialized transaction.
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
   * Called on POST /contracts/:id/rent/topup.
   * Builds an unsigned top_up_rent transaction for the tenant to sign on their device.
   * The tenant pre-funds the escrow with enough SOL to cover `months` monthly rent releases.
   * Amount deposited = rent_lamports × 1.005 × months (includes tenant's 0.5% fee share).
   */
  buildTopUpRentTx(
    contractId: string,
    tenantPubkey: string,
    rentLamports: number,
    months: number,
  ): Promise<SolanaTopUpRentTxResult>;

  /**
   * Called by the server's monthly cron job on the 1st of each month.
   * Authority-signed — no tenant action required.
   * Releases one month of pre-paid rent from PDA escrow to landlord and platform.
   * Fee model: landlord receives rent − 0.5%, platform receives 1% total.
   */
  releaseMonthlyRent(
    contractId: string,
    rentLamports: number,
    landlordPubkey: string,
    platformPubkey: string,
  ): Promise<SolanaReleaseRentResult>;

  /**
   * Called on POST /contracts/:id/settlement/approve (when second side approves).
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
