import { z } from 'zod';

import { query, queryOne, withTransaction } from '../../shared/db/index.js';
import { env } from '../../config/env.js';
import { getSolanaService } from '../../services/solana/instance.js';
import type { DbContract, DbRentPayment, DbUser } from '../../shared/types/index.js';
import { AppError } from '../../shared/utils/errors.js';
import { logAuditEvent } from '../audit/audit.service.js';

export const initRentPaymentBodySchema = z.object({});

export const confirmRentPaymentBodySchema = z.object({
  tx_signature: z.string().min(1).max(88),
  period_month: z.number().int().min(1).max(12),
  period_year: z.number().int().min(2024),
});
export type ConfirmRentPaymentBody = z.infer<typeof confirmRentPaymentBodySchema>;

export interface RentPayment {
  id: string;
  contract_id: string;
  tenant_id: string;
  rent_amount_eur: number;
  rent_lamports: number;
  landlord_amount_lamports: number;
  platform_fee_lamports: number;
  tx_signature: string;
  period_month: number;
  period_year: number;
  paid_at: string;
}

function toRentPayment(db: DbRentPayment): RentPayment {
  return {
    id: db.id,
    contract_id: db.contract_id,
    tenant_id: db.tenant_id,
    rent_amount_eur: parseFloat(db.rent_amount_eur),
    rent_lamports: parseInt(db.rent_lamports, 10),
    landlord_amount_lamports: parseInt(db.landlord_amount_lamports, 10),
    platform_fee_lamports: parseInt(db.platform_fee_lamports, 10),
    tx_signature: db.tx_signature,
    period_month: db.period_month,
    period_year: db.period_year,
    paid_at: db.paid_at.toISOString(),
  };
}

/**
 * Builds an unsigned pay_rent transaction for the tenant to sign on their device.
 * Returns the serialized transaction + fee breakdown so the mobile app can display it.
 *
 * POST /contracts/:id/rent/pay
 */
export async function buildRentPaymentTx(
  contractId: string,
  tenantId: string,
): Promise<{
  serialized_tx: string;
  rent_lamports: number;
  landlord_amount: number;
  platform_fee_total: number;
  rent_amount_eur: number;
}> {
  const contractRow = await queryOne<DbContract>(
    `SELECT * FROM contracts WHERE id = $1`,
    [contractId],
  );
  if (!contractRow) throw AppError.notFound('Contract not found.');
  if (contractRow.tenant_id !== tenantId) throw AppError.forbidden('Only the tenant can pay rent.');
  if (contractRow.status !== 'active') {
    throw AppError.conflict(`Rent can only be paid on an active contract (current status: ${contractRow.status}).`);
  }

  const [tenantRes, landlordRes] = await Promise.all([
    queryOne<DbUser>(`SELECT solana_pubkey FROM users WHERE id = $1`, [tenantId]),
    queryOne<DbUser>(`SELECT solana_pubkey FROM users WHERE id = $1`, [contractRow.landlord_id]),
  ]);

  const tenantPubkey = tenantRes?.solana_pubkey;
  const landlordPubkey = landlordRes?.solana_pubkey;
  if (!tenantPubkey) throw AppError.conflict('Tenant must register a Solana wallet to pay rent.');
  if (!landlordPubkey) throw AppError.conflict('Landlord must have a Solana wallet to receive rent.');

  const solana = getSolanaService();
  const rentAmountEur = parseFloat(contractRow.rent_monthly_eur);
  const rentLamports = solana.eurToLamports(rentAmountEur);

  const result = await solana.buildPayRentTx(
    contractId,
    tenantPubkey,
    landlordPubkey,
    env.PLATFORM_SOLANA_PUBKEY,
    rentLamports,
  );

  return {
    serialized_tx: result.serialized_tx,
    rent_lamports: result.rent_lamports,
    landlord_amount: result.landlord_amount,
    platform_fee_total: result.platform_fee_total,
    rent_amount_eur: rentAmountEur,
  };
}

/**
 * Records a confirmed on-chain rent payment after the tenant has signed and
 * broadcast the transaction from their device.
 *
 * POST /contracts/:id/rent/confirm
 */
export async function confirmRentPayment(
  contractId: string,
  tenantId: string,
  body: ConfirmRentPaymentBody,
): Promise<RentPayment> {
  return withTransaction(async (client) => {
    const contractRow = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = contractRow.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');
    if (c.tenant_id !== tenantId) throw AppError.forbidden('Only the tenant can confirm rent payment.');
    if (c.status !== 'active') {
      throw AppError.conflict(`Rent can only be confirmed on an active contract (current status: ${c.status}).`);
    }

    // Prevent duplicate tx_signature submissions
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM rent_payments WHERE tx_signature = $1`,
      [body.tx_signature],
    );
    if (existing.rows.length > 0) throw AppError.conflict('This transaction has already been recorded.');

    // Prevent double-payment for the same period
    const duplicate = await client.query<{ id: string }>(
      `SELECT id FROM rent_payments WHERE contract_id = $1 AND period_month = $2 AND period_year = $3`,
      [contractId, body.period_month, body.period_year],
    );
    if (duplicate.rows.length > 0) {
      throw AppError.conflict(`Rent for ${body.period_month}/${body.period_year} has already been paid.`);
    }

    const solana = getSolanaService();
    const rentAmountEur = parseFloat(c.rent_monthly_eur);
    const rentLamports = solana.eurToLamports(rentAmountEur);
    const feePerSide = Math.floor((rentLamports * 50) / 10_000);
    const landlordAmountLamports = rentLamports - feePerSide;
    const platformFeeLamports = feePerSide * 2;

    const insertResult = await client.query<DbRentPayment>(
      `INSERT INTO rent_payments
         (contract_id, tenant_id, rent_amount_eur, rent_lamports,
          landlord_amount_lamports, platform_fee_lamports, tx_signature,
          period_month, period_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        contractId,
        tenantId,
        rentAmountEur,
        rentLamports,
        landlordAmountLamports,
        platformFeeLamports,
        body.tx_signature,
        body.period_month,
        body.period_year,
      ],
    );
    const row = insertResult.rows[0];
    if (!row) throw AppError.internal('Failed to record rent payment.');

    await logAuditEvent(
      contractId,
      'RENT_PAID',
      tenantId,
      'tenant',
      {
        tx_signature: body.tx_signature,
        period_month: body.period_month,
        period_year: body.period_year,
        rent_amount_eur: rentAmountEur,
        rent_lamports: rentLamports,
        landlord_amount_lamports: landlordAmountLamports,
        platform_fee_lamports: platformFeeLamports,
      },
      client,
    );

    return toRentPayment(row);
  });
}

/**
 * Lists all rent payments for a contract.
 *
 * GET /contracts/:id/rent
 */
export async function listRentPayments(contractId: string, requesterId: string): Promise<RentPayment[]> {
  const c = await queryOne<{ landlord_id: string; tenant_id: string | null }>(
    `SELECT landlord_id, tenant_id FROM contracts WHERE id = $1`,
    [contractId],
  );
  if (!c) throw AppError.notFound('Contract not found.');
  if (requesterId !== c.landlord_id && requesterId !== c.tenant_id) {
    throw AppError.forbidden('Access denied.');
  }

  const rows = await query<DbRentPayment>(
    `SELECT * FROM rent_payments WHERE contract_id = $1 ORDER BY period_year ASC, period_month ASC`,
    [contractId],
  );
  return rows.map(toRentPayment);
}
