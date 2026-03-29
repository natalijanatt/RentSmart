/**
 * On-chain types matching the Rust program's account structure.
 * Generated IDL (target/idl/rentsmart.json) is the canonical source for account layout.
 */

/** Raw on-chain representation of RentalAgreement account fields as returned by Anchor. */
export interface RentalAgreementRaw {
  contractId: number[];        // [u8; 36]
  contractHash: number[];      // [u8; 32]
  depositLamports: bigint;
  landlord: string;            // base58 public key (Anchor deserializes Pubkey → string)
  tenant: string;
  state: AgreementStateRaw;
  checkinHash: number[];       // [u8; 32]
  checkoutHash: number[];      // [u8; 32]
  settlementHash: number[];    // [u8; 32]
  bump: number;
}

/** Anchor deserializes Rust enums as objects with a single key matching the variant name. */
export type AgreementStateRaw =
  | { created: Record<string, never> }
  | { depositLocked: Record<string, never> }
  | { checkinRecorded: Record<string, never> }
  | { checkoutRecorded: Record<string, never> }
  | { settled: Record<string, never> };

export type AgreementStateLabel =
  | 'Created'
  | 'DepositLocked'
  | 'CheckinRecorded'
  | 'CheckoutRecorded'
  | 'Settled';

/** Convert Anchor's enum object representation to a plain string label. */
export function getStateLabel(state: AgreementStateRaw): AgreementStateLabel {
  if ('created' in state) return 'Created';
  if ('depositLocked' in state) return 'DepositLocked';
  if ('checkinRecorded' in state) return 'CheckinRecorded';
  if ('checkoutRecorded' in state) return 'CheckoutRecorded';
  return 'Settled';
}
