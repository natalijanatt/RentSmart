import 'dotenv/config';
import { SolanaService } from './client/src/index.js';
import crypto from 'crypto';
import { Connection, Transaction, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';

async function main() {
const s = new SolanaService();
const contractId = '550e8400-e29b-41d4-a716-446655440000';
const contractHash = crypto.createHash('sha256').update('test contract').digest();
const landlordPubkey = (s as any).authority.publicKey.toBase58();

// 1. PDA derivation
const pda = s.findPDA(contractId);
console.log('\n1. PDA:', pda);

// 2. Initialize contract
console.log('\n2. Initializing contract...');
const depositLamports = 0.1 * LAMPORTS_PER_SOL;
const init = await s.initializeContract(contractId, contractHash, depositLamports, landlordPubkey);
console.log('   tx:', init.tx_signature);
console.log('   pda:', init.pda_address);

// 3. Read state after initialize
let agreement = await s.getAgreement(contractId);
console.log('\n3. State after initialize:', agreement?.state);

// 4. Simulate tenant locking deposit (using authority as tenant for local testing)
console.log('\n4. Building lock_deposit tx...');
const tenantPubkey = landlordPubkey; // reuse authority as tenant in local test
const { serialized_tx } = await s.buildLockDepositTx(contractId, tenantPubkey);
console.log('   serialized tx (base64):', serialized_tx.slice(0, 60) + '...');

// Sign and send the lock_deposit tx as the authority (acts as tenant here)
const connection = new Connection(process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899', 'confirmed');
const tx = Transaction.from(Buffer.from(serialized_tx, 'base64'));
const authority = (s as any).authority as Keypair;
tx.sign(authority);
const lockSig = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(lockSig);
console.log('   tx:', lockSig);

// 5. Record checkin
console.log('\n5. Recording checkin...');
const checkinHash = s.hashImages(['img_hash_1', 'img_hash_2']);
const checkin = await s.recordCheckin(contractId, checkinHash, landlordPubkey);
console.log('   tx:', checkin.tx_signature);

// 6. Record checkout
console.log('\n6. Recording checkout...');
const checkoutHash = s.hashImages(['img_hash_3', 'img_hash_4']);
const checkout = await s.recordCheckout(contractId, checkoutHash, tenantPubkey);
console.log('   tx:', checkout.tx_signature);

// 7. Execute settlement (80% back to tenant, 20% to landlord)
console.log('\n7. Executing settlement...');
const settlementHash = crypto.createHash('sha256').update('{"tenant":80,"landlord":20}').digest();
const tenantAmount = Math.floor(depositLamports * 0.8);
const landlordAmount = depositLamports - tenantAmount;
const settlement = await s.executeSettlement(
  contractId, settlementHash,
  tenantAmount, landlordAmount,
  tenantPubkey, landlordPubkey,
);
console.log('   tx:', settlement.tx_signature);

// 8. Final state
agreement = await s.getAgreement(contractId);
console.log('\n8. Final state:', agreement?.state);
console.log('   deposit_lamports:', agreement?.deposit_lamports);
console.log('\nDone.');
}

main().catch(console.error);
