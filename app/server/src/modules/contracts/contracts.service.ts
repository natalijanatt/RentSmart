import crypto from 'crypto';

import type { PoolClient } from 'pg';

import type { Contract, CreateContractBody, Room } from '@rentsmart/contracts';

import { query, queryOne, withTransaction } from '../../shared/db/index.js';
import type { DbContract, DbRoom } from '../../shared/types/index.js';
import { AppError } from '../../shared/utils/errors.js';
import { sha256 } from '../../shared/utils/hash.js';
import { logAuditEvent } from '../audit/audit.service.js';
import { assertCancellable, validateTransition } from './state-machine.js';

function toRoom(db: DbRoom): Room {
  return {
    id: db.id,
    contract_id: db.contract_id,
    room_type: db.room_type as Room['room_type'],
    custom_name: db.custom_name,
    is_mandatory: db.is_mandatory,
    display_order: db.display_order,
  };
}

function toContract(db: DbContract, rooms: DbRoom[]): Contract {
  return {
    id: db.id,
    landlord_id: db.landlord_id,
    tenant_id: db.tenant_id,
    invite_code: db.invite_code,
    property_address: db.property_address,
    property_gps_lat: db.property_gps_lat !== null ? parseFloat(db.property_gps_lat) : null,
    property_gps_lng: db.property_gps_lng !== null ? parseFloat(db.property_gps_lng) : null,
    rent_monthly_eur: parseFloat(db.rent_monthly_eur),
    deposit_amount_eur: parseFloat(db.deposit_amount_eur),
    start_date: db.start_date.toISOString(),
    end_date: db.end_date.toISOString(),
    deposit_rules: db.deposit_rules,
    notes: db.notes,
    plain_language_summary: db.plain_language_summary,
    status: db.status as Contract['status'],
    deposit_status: db.deposit_status,
    contract_hash: db.contract_hash,
    rejection_comment: db.rejection_comment,
    solana_pda: db.solana_pda,
    solana_tx_init: db.solana_tx_init,
    created_at: db.created_at.toISOString(),
    updated_at: db.updated_at.toISOString(),
    rooms: rooms.map(toRoom),
  };
}

function generateInviteCode(): string {
  return crypto.randomBytes(6).toString('base64url').toUpperCase().slice(0, 8);
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
    const inviteCode = generateInviteCode();

    const contractHash = sha256(
      JSON.stringify({
        property_address: body.property_address,
        deposit_amount_eur: body.deposit_amount_eur,
        start_date: body.start_date,
        end_date: body.end_date,
        rooms: body.rooms,
      }),
    );

    const contractResult = await client.query<DbContract>(
      `INSERT INTO contracts
         (landlord_id, invite_code, property_address, property_gps_lat, property_gps_lng,
          rent_monthly_eur, deposit_amount_eur, start_date, end_date,
          deposit_rules, notes, status, deposit_status, contract_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', 'pending', $12)
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
        contractHash,
      ],
    );

    const contractRow = contractResult.rows[0];
    if (!contractRow) throw AppError.internal('Failed to insert contract.');

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

export async function acceptContract(contractId: string, tenantId: string): Promise<Contract> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const contractRow = result.rows[0];

    if (!contractRow) throw AppError.notFound('Contract not found.');
    if (tenantId === contractRow.landlord_id) {
      throw AppError.conflict('You are already the landlord on this contract.');
    }
    if (contractRow.tenant_id !== null) {
      throw AppError.conflict('Contract already has a tenant.');
    }

    validateTransition(contractRow.status as Contract['status'], 'accepted', 'tenant');

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = 'accepted', tenant_id = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [tenantId, contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(contractId, 'CONTRACT_ACCEPTED', tenantId, 'tenant', {}, client);

    const roomRows = await fetchRooms(contractId, client);
    return toContract(updatedRow, roomRows);
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
