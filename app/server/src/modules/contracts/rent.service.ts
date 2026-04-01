import { z } from 'zod';

import { query, queryOne, withTransaction } from '../../shared/db/index.js';
import { env } from '../../config/env.js';
import { getSolanaService } from '../../services/solana/instance.js';
import type { DbContract, DbRentRelease, DbRentTopUp, DbUser } from '../../shared/types/index.js';
import { AppError } from '../../shared/utils/errors.js';
import { logAuditEvent } from '../audit/audit.service.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const buildTopUpRentBodySchema = z.object({
  months: z.number().int().min(1).max(12),
});
export type BuildTopUpRentBody = z.infer<typeof buildTopUpRentBodySchema>;

export const confirmTopUpBodySchema = z.object({
  tx_signature: z.string().min(1).max(88),
  months_covered: z.number().int().min(1).max(12),
});
export type ConfirmTopUpBody = z.infer<typeof confirmTopUpBodySchema>;

// ── Response shapes ───────────────────────────────────────────────────────────

export interface RentTopUp {
  id: string;
  contract_id: string;
  tenant_id: string;
  rent_amount_eur: number;
  amount_lamports: number;
  months_covered: number;
  fee_lamports: number;
  tx_signature: string;
  created_at: string;
}

export interface RentRelease {
  id: string;
  contract_id: string;
  rent_amount_eur: number;
  rent_lamports: number;
  landlord_amount_lamports: number;
  platform_fee_lamports: number;
  tx_signature: string;
  period_month: number;
  period_year: number;
  released_at: string;
}

function toRentTopUp(db: DbRentTopUp): RentTopUp {
  return {
    id: db.id,
    contract_id: db.contract_id,
    tenant_id: db.tenant_id,
    rent_amount_eur: parseFloat(db.rent_amount_eur),
    amount_lamports: parseInt(db.amount_lamports, 10),
    months_covered: db.months_covered,
    fee_lamports: parseInt(db.fee_lamports, 10),
    tx_signature: db.tx_signature,
    created_at: db.created_at.toISOString(),
  };
}

function toRentRelease(db: DbRentRelease): RentRelease {
  return {
    id: db.id,
    contract_id: db.contract_id,
    rent_amount_eur: parseFloat(db.rent_amount_eur),
    rent_lamports: parseInt(db.rent_lamports, 10),
    landlord_amount_lamports: parseInt(db.landlord_amount_lamports, 10),
    platform_fee_lamports: parseInt(db.platform_fee_lamports, 10),
    tx_signature: db.tx_signature,
    period_month: db.period_month,
    period_year: db.period_year,
    released_at: db.released_at.toISOString(),
  };
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Builds an unsigned top_up_rent transaction for the tenant to sign on their device.
 * The tenant pre-funds the escrow with enough SOL to cover `months` monthly releases.
 *
 * POST /contracts/:id/rent/topup
 */
export async function buildTopUpRentTx(
  contractId: string,
  tenantId: string,
  body: BuildTopUpRentBody,
): Promise<{
  serialized_tx: string;
  amount_lamports: number;
  months_covered: number;
  fee_lamports: number;
  rent_amount_eur: number;
}> {
  const contractRow = await queryOne<DbContract>(
    `SELECT * FROM contracts WHERE id = $1`,
    [contractId],
  );
  if (!contractRow) throw AppError.notFound('Contract not found.');
  if (contractRow.tenant_id !== tenantId) throw AppError.forbidden('Only the tenant can top up the rent escrow.');
  if (contractRow.status !== 'active' && contractRow.status !== 'accepted') {
    throw AppError.conflict(`Rent top-up is only allowed on accepted or active contracts (current status: ${contractRow.status}).`);
  }

  const tenantRes = await queryOne<DbUser>(`SELECT solana_pubkey FROM users WHERE id = $1`, [tenantId]);
  const tenantPubkey = tenantRes?.solana_pubkey;
  if (!tenantPubkey) throw AppError.conflict('Tenant must register a Solana wallet to top up the rent escrow.');

  const solana = getSolanaService();
  const rentAmountEur = parseFloat(contractRow.rent_monthly_eur);
  const rentLamports = solana.eurToLamports(rentAmountEur);

  const result = await solana.buildTopUpRentTx(contractId, tenantPubkey, rentLamports, body.months);

  return {
    serialized_tx: result.serialized_tx,
    amount_lamports: result.amount_lamports,
    months_covered: result.months_covered,
    fee_lamports: result.fee_lamports,
    rent_amount_eur: rentAmountEur,
  };
}

/**
 * Records a confirmed on-chain top-up after the tenant has signed and broadcast the transaction.
 *
 * POST /contracts/:id/rent/topup/confirm
 */
export async function confirmTopUp(
  contractId: string,
  tenantId: string,
  body: ConfirmTopUpBody,
): Promise<RentTopUp> {
  return withTransaction(async (client) => {
    const contractRow = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = contractRow.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');
    if (c.tenant_id !== tenantId) throw AppError.forbidden('Only the tenant can confirm a rent top-up.');
    if (c.status !== 'active' && c.status !== 'accepted') {
      throw AppError.conflict(`Rent top-up is only allowed on accepted or active contracts (current status: ${c.status}).`);
    }

    // Prevent duplicate tx_signature submissions
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM rent_top_ups WHERE tx_signature = $1`,
      [body.tx_signature],
    );
    if (existing.rows.length > 0) throw AppError.conflict('This transaction has already been recorded.');

    const solana = getSolanaService();
    const rentAmountEur = parseFloat(c.rent_monthly_eur);
    const rentLamports = solana.eurToLamports(rentAmountEur);
    const feePerMonth = Math.floor((rentLamports * 50) / 10_000);
    const amountLamports = (rentLamports + feePerMonth) * body.months_covered;
    const feeLamports = feePerMonth * body.months_covered;

    const insertResult = await client.query<DbRentTopUp>(
      `INSERT INTO rent_top_ups
         (contract_id, tenant_id, rent_amount_eur, amount_lamports, months_covered, fee_lamports, tx_signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [contractId, tenantId, rentAmountEur, amountLamports, body.months_covered, feeLamports, body.tx_signature],
    );
    const row = insertResult.rows[0];
    if (!row) throw AppError.internal('Failed to record rent top-up.');

    await logAuditEvent(
      contractId,
      'RENT_TOPPED_UP',
      tenantId,
      'tenant',
      {
        tx_signature: body.tx_signature,
        months_covered: body.months_covered,
        rent_amount_eur: rentAmountEur,
        amount_lamports: amountLamports,
        fee_lamports: feeLamports,
      },
      client,
    );

    return toRentTopUp(row);
  });
}

/**
 * Called by the monthly cron job. Iterates all active contracts and releases
 * one month of pre-paid rent from the on-chain escrow for each.
 *
 * Skips contracts where the release for the given period has already been recorded
 * (idempotent — safe to retry on failure).
 */
export async function releaseMonthlyRentForAllActive(month: number, year: number): Promise<void> {
  // Fetch all active contracts that have a Solana PDA initialized
  const activeContracts = await query<{
    id: string;
    rent_monthly_eur: string;
    landlord_id: string;
  }>(
    `SELECT id, rent_monthly_eur, landlord_id
     FROM contracts
     WHERE status = 'active' AND solana_pda IS NOT NULL`,
    [],
  );

  if (activeContracts.length === 0) return;

  const solana = getSolanaService();

  for (const contract of activeContracts) {
    try {
      // Skip if already released for this period
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM rent_releases WHERE contract_id = $1 AND period_month = $2 AND period_year = $3`,
        [contract.id, month, year],
      );
      if (existing) {
        console.log(`[RentRelease] Already released for ${contract.id} period ${month}/${year} — skipping`);
        continue;
      }

      const landlordRes = await queryOne<DbUser>(
        `SELECT solana_pubkey FROM users WHERE id = $1`,
        [contract.landlord_id],
      );
      const landlordPubkey = landlordRes?.solana_pubkey;
      if (!landlordPubkey) {
        console.warn(`[RentRelease] Landlord has no Solana wallet for contract ${contract.id} — skipping`);
        continue;
      }

      const rentAmountEur = parseFloat(contract.rent_monthly_eur);
      const rentLamports = solana.eurToLamports(rentAmountEur);

      const result = await solana.releaseMonthlyRent(
        contract.id,
        rentLamports,
        landlordPubkey,
        env.PLATFORM_SOLANA_PUBKEY,
      );

      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO rent_releases
             (contract_id, rent_amount_eur, rent_lamports, landlord_amount_lamports,
              platform_fee_lamports, tx_signature, period_month, period_year)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            contract.id,
            rentAmountEur,
            rentLamports,
            result.landlord_amount,
            result.platform_fee,
            result.tx_signature,
            month,
            year,
          ],
        );

        await logAuditEvent(
          contract.id,
          'RENT_RELEASED',
          null,
          'system',
          {
            tx_signature: result.tx_signature,
            period_month: month,
            period_year: year,
            rent_amount_eur: rentAmountEur,
            rent_lamports: rentLamports,
            landlord_amount_lamports: result.landlord_amount,
            platform_fee_lamports: result.platform_fee,
          },
          client,
        );
      });

      console.log(`[RentRelease] Released rent for contract ${contract.id} period ${month}/${year}: tx=${result.tx_signature}`);
    } catch (err) {
      // Log and continue — one failed release should not block others
      console.error(`[RentRelease] Failed for contract ${contract.id} period ${month}/${year}:`, err);
    }
  }
}

/**
 * Lists all rent top-ups and releases for a contract.
 *
 * GET /contracts/:id/rent
 */
export async function listRentActivity(
  contractId: string,
  requesterId: string,
): Promise<{ top_ups: RentTopUp[]; releases: RentRelease[] }> {
  const c = await queryOne<{ landlord_id: string; tenant_id: string | null }>(
    `SELECT landlord_id, tenant_id FROM contracts WHERE id = $1`,
    [contractId],
  );
  if (!c) throw AppError.notFound('Contract not found.');
  if (requesterId !== c.landlord_id && requesterId !== c.tenant_id) {
    throw AppError.forbidden('Access denied.');
  }

  const [topUpRows, releaseRows] = await Promise.all([
    query<DbRentTopUp>(
      `SELECT * FROM rent_top_ups WHERE contract_id = $1 ORDER BY created_at ASC`,
      [contractId],
    ),
    query<DbRentRelease>(
      `SELECT * FROM rent_releases WHERE contract_id = $1 ORDER BY period_year ASC, period_month ASC`,
      [contractId],
    ),
  ]);

  return {
    top_ups: topUpRows.map(toRentTopUp),
    releases: releaseRows.map(toRentRelease),
  };
}
