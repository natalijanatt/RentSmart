import type { PoolClient } from 'pg';

import type { Contract, CreateContractBody } from '@rentsmart/contracts';

import { query, queryOne, withTransaction } from '../../shared/db/index.js';
import { getSolanaService } from '../../services/solana/instance.js';
import type { DbContract, DbRoom, DbUser } from '../../shared/types/index.js';
import { AppError } from '../../shared/utils/errors.js';
import { sha256 } from '../../shared/utils/hash.js';
import { toContract } from '../../shared/utils/mappers.js';
import { logAuditEvent } from '../audit/audit.service.js';
import { assertCancellable, validateTransition } from './state-machine.js';

function generateInviteCode(): string {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = 'RS-';
  for (let i = 0; i < 6; i++) {
    code += charset[Math.floor(Math.random() * charset.length)];
  }
  return code;
}

async function fetchRooms(contractId: string, client?: PoolClient): Promise<DbRoom[]> {
  const sql = `SELECT * FROM rooms WHERE contract_id = $1 ORDER BY display_order ASC`;
  if (client) {
    const result = await client.query<DbRoom>(sql, [contractId]);
    return result.rows;
  }
  return query<DbRoom>(sql, [contractId]);
}

export async function createContract(
  landlordId: string,
  body: CreateContractBody,
): Promise<Contract> {
  return withTransaction(async (client) => {
    // Generate unique invite code with collision retry
    let inviteCode = generateInviteCode();
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const existing = await client.query(
        `SELECT 1 FROM contracts WHERE invite_code = $1`,
        [inviteCode],
      );
      if (existing.rows.length === 0) break;
      if (attempt === MAX_RETRIES - 1) {
        throw AppError.internal('Failed to generate unique invite code after retries.');
      }
      inviteCode = generateInviteCode();
    }

    const contractHash = sha256(
      JSON.stringify({
        property_address: body.property_address,
        deposit_amount_eur: body.deposit_amount_eur,
        start_date: body.start_date,
        end_date: body.end_date,
        rooms: body.rooms,
      }),
    );

    const plainLanguageSummary =
      `Stan na adresi ${body.property_address} izdaje se uz mesečnu kiriju od ${body.rent_monthly_eur}€ ` +
      `i depozit od ${body.deposit_amount_eur}€. Ugovor važi od ${body.start_date} do ${body.end_date}. ` +
      (body.deposit_rules ? `Pravila depozita: ${body.deposit_rules}` : 'Depozit se vraća u celosti ako nema oštećenja.');

    const contractResult = await client.query<DbContract>(
      `INSERT INTO contracts
         (landlord_id, invite_code, property_address, property_gps_lat, property_gps_lng,
          rent_monthly_eur, deposit_amount_eur, start_date, end_date,
          deposit_rules, notes, plain_language_summary, status, deposit_status, contract_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending_acceptance', 'pending', $13)
       RETURNING *`,
      [
        landlordId,
        inviteCode,
        body.property_address,
        body.property_gps?.lat ?? null,
        body.property_gps?.lng ?? null,
        body.rent_monthly_eur,
        body.deposit_amount_eur,
        body.start_date,
        body.end_date,
        body.deposit_rules ?? null,
        body.notes ?? null,
        plainLanguageSummary,
        contractHash,
      ],
    );

    const contractRow = contractResult.rows[0];
    if (!contractRow) throw AppError.internal('Failed to insert contract.');

    // Initialize on-chain PDA — mandatory
    const landlordResult = await client.query<DbUser>(
      `SELECT solana_pubkey FROM users WHERE id = $1`,
      [landlordId],
    );
    const landlordPubkey = landlordResult.rows[0]?.solana_pubkey;
    if (!landlordPubkey) throw AppError.conflict('Landlord must register a Solana wallet before creating a contract.');

    const solana = getSolanaService();
    const depositLamports = solana.eurToLamports(body.deposit_amount_eur);
    const contractHashBuffer = Buffer.from(contractHash, 'hex');
    const solanaResult = await solana.initializeContract(
      contractRow.id,
      contractHashBuffer,
      depositLamports,
      landlordPubkey,
    );

    await client.query(
      `UPDATE contracts SET solana_pda = $1, solana_tx_init = $2 WHERE id = $3`,
      [solanaResult.pda_address, solanaResult.tx_signature, contractRow.id],
    );
    contractRow.solana_pda = solanaResult.pda_address;
    contractRow.solana_tx_init = solanaResult.tx_signature;

    await logAuditEvent(
      contractRow.id,
      'CONTRACT_HASH_STORED',
      landlordId,
      'landlord',
      { solana_pda: solanaResult.pda_address, solana_tx: solanaResult.tx_signature },
      client,
    );

    const roomRows: DbRoom[] = [];
    for (let i = 0; i < body.rooms.length; i++) {
      const room = body.rooms[i];
      const roomResult = await client.query<DbRoom>(
        `INSERT INTO rooms (contract_id, room_type, custom_name, is_mandatory, display_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [contractRow.id, room.room_type, room.custom_name ?? null, room.is_mandatory, i],
      );
      const roomRow = roomResult.rows[0];
      if (roomRow) roomRows.push(roomRow);
    }

    await logAuditEvent(
      contractRow.id,
      'CONTRACT_CREATED',
      landlordId,
      'landlord',
      { invite_code: inviteCode, property_address: body.property_address },
      client,
    );

    await logAuditEvent(
      contractRow.id,
      'INVITE_SENT',
      landlordId,
      'landlord',
      { invite_code: inviteCode },
      client,
    );

    return toContract(contractRow, roomRows);
  });
}

export async function listContracts(userId: string): Promise<Contract[]> {
  const contractRows = await query<DbContract>(
    `SELECT * FROM contracts WHERE landlord_id = $1 OR tenant_id = $1 ORDER BY created_at DESC`,
    [userId],
  );

  if (contractRows.length === 0) return [];

  const contractIds = contractRows.map((c) => c.id);
  const roomRows = await query<DbRoom>(
    `SELECT * FROM rooms WHERE contract_id = ANY($1::uuid[]) ORDER BY display_order ASC`,
    [contractIds],
  );

  const roomsByContract = new Map<string, DbRoom[]>();
  for (const room of roomRows) {
    const existing = roomsByContract.get(room.contract_id) ?? [];
    existing.push(room);
    roomsByContract.set(room.contract_id, existing);
  }

  return contractRows.map((c) => toContract(c, roomsByContract.get(c.id) ?? []));
}

export async function getContract(contractId: string, requesterId: string): Promise<Contract> {
  const contractRow = await queryOne<DbContract>(
    `SELECT * FROM contracts WHERE id = $1`,
    [contractId],
  );

  if (!contractRow) throw AppError.notFound('Contract not found.');

  if (requesterId !== contractRow.landlord_id && requesterId !== contractRow.tenant_id) {
    throw AppError.forbidden('Access denied.');
  }

  const roomRows = await fetchRooms(contractId);
  return toContract(contractRow, roomRows);
}

export async function getContractByInviteCode(code: string): Promise<Contract> {
  const contractRow = await queryOne<DbContract>(
    `SELECT * FROM contracts WHERE invite_code = $1`,
    [code],
  );

  if (!contractRow) throw AppError.notFound('Invite code not found.');

  const roomRows = await fetchRooms(contractRow.id);
  return toContract(contractRow, roomRows);
}

export async function acceptContract(
  contractId: string,
  tenantId: string,
  inviteCode: string,
): Promise<{ contract: Contract; solana_lock_deposit_tx: string }> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const contractRow = result.rows[0];

    if (!contractRow) throw AppError.notFound('Contract not found.');
    if (contractRow.invite_code !== inviteCode) {
      throw AppError.forbidden('Invalid invite code.');
    }
    if (tenantId === contractRow.landlord_id) {
      throw AppError.conflict('You are already the landlord on this contract.');
    }
    if (contractRow.tenant_id !== null) {
      throw AppError.conflict('Contract already has a tenant.');
    }

    // Tenant must have a Solana wallet to lock the deposit on-chain
    const tenantResult = await client.query<DbUser>(
      `SELECT solana_pubkey FROM users WHERE id = $1`,
      [tenantId],
    );
    const tenantPubkey = tenantResult.rows[0]?.solana_pubkey;
    if (!tenantPubkey) throw AppError.conflict('Tenant must register a Solana wallet before accepting a contract.');

    validateTransition(contractRow.status as Contract['status'], 'accepted', 'tenant');

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = 'accepted', deposit_status = 'locked', tenant_id = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [tenantId, contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(contractId, 'CONTRACT_ACCEPTED', tenantId, 'tenant', {}, client);
    await logAuditEvent(contractId, 'DEPOSIT_LOCK_TX_BUILT', tenantId, 'tenant', {}, client);

    // Build unsigned lock_deposit transaction for tenant to sign on their device
    const { serialized_tx } = await getSolanaService().buildLockDepositTx(contractId, tenantPubkey);

    const roomRows = await fetchRooms(contractId, client);
    return { contract: toContract(updatedRow, roomRows), solana_lock_deposit_tx: serialized_tx };
  });
}

export async function cancelContract(
  contractId: string,
  actorId: string,
  reason?: string,
): Promise<Contract> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const contractRow = result.rows[0];

    if (!contractRow) throw AppError.notFound('Contract not found.');

    const isLandlord = actorId === contractRow.landlord_id;
    const isTenant = actorId === contractRow.tenant_id;

    if (!isLandlord && !isTenant) throw AppError.forbidden('Access denied.');

    const actorRole = isLandlord ? 'landlord' : 'tenant';

    assertCancellable(contractRow.status as Contract['status']);

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = 'cancelled', rejection_comment = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason ?? null, contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(
      contractId,
      'CONTRACT_CANCELLED',
      actorId,
      actorRole,
      { reason: reason ?? null },
      client,
    );

    const roomRows = await fetchRooms(contractId, client);
    return toContract(updatedRow, roomRows);
  });
}
