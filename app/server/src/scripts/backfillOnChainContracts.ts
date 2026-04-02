import dotenv from 'dotenv';
import path from 'path';

import { Client } from 'pg';
import { SolanaService } from '@rentsmart/blockchain';

type MockContractRow = {
  id: string;
  landlord_id: string;
  contract_hash: string | null;
  deposit_amount_eur: string;
};

type MockUserRow = {
  solana_pubkey: string | null;
};

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const solana = new SolanaService();
    const contracts = await client.query<MockContractRow>(
      `SELECT id, landlord_id, contract_hash, deposit_amount_eur, solana_tx_init
       FROM contracts
       WHERE solana_tx_init LIKE 'mock_tx_init_%'
       ORDER BY created_at ASC`,
    );

    if (contracts.rows.length === 0) {
      console.log('No mock on-chain contracts found.');
      return;
    }

    for (const contract of contracts.rows) {
      const landlordResult = await client.query<MockUserRow>(
        `SELECT solana_pubkey FROM users WHERE id = $1`,
        [contract.landlord_id],
      );
      const landlordPubkey = landlordResult.rows[0]?.solana_pubkey;
      if (!landlordPubkey) {
        console.warn(`[Backfill] Skipping ${contract.id} — landlord has no Solana wallet.`);
        continue;
      }

      if (!contract.contract_hash) {
        console.warn(`[Backfill] Skipping ${contract.id} — missing contract hash.`);
        continue;
      }

      const existingAgreement = await solana.getAgreement(contract.id);
      if (existingAgreement) {
        console.log(`[Backfill] ${contract.id} already exists on-chain at ${existingAgreement.explorer_url}`);
        continue;
      }

      const init = await solana.initializeContract(
        contract.id,
        Buffer.from(contract.contract_hash, 'hex'),
        solana.eurToLamports(parseFloat(contract.deposit_amount_eur)),
        landlordPubkey,
      );

      await client.query(
        `UPDATE contracts
         SET solana_pda = $1,
             solana_tx_init = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [init.pda_address, init.tx_signature, contract.id],
      );

      console.log(`[Backfill] ${contract.id} -> ${init.pda_address} (${init.tx_signature})`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[Backfill] Failed:', err);
  process.exit(1);
});
