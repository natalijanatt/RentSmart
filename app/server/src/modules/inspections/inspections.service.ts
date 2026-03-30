import type { PoolClient } from 'pg';

import type { Contract, InspectionImage, Room } from '@rentsmart/contracts';

import { withTransaction, query, queryOne } from '../../shared/db/index.js';
import { supabase, STORAGE_BUCKET } from '../../shared/db/supabase.js';
import type { DbContract, DbInspectionImage, DbRoom } from '../../shared/types/index.js';
import { AppError } from '../../shared/utils/errors.js';
import { haversineDistance, GPS_MAX_DISTANCE_M } from '../../shared/utils/geo.js';
import { sha256Buffer } from '../../shared/utils/hash.js';
import { logAuditEvent } from '../audit/audit.service.js';
import { validateTransition } from '../contracts/state-machine.js';
import { runAnalysis } from '../analysis/analysis.service.js';

// ── Mappers ───────────────────────────────────────────────────────────────────

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

function toInspectionImage(db: DbInspectionImage): InspectionImage {
  return {
    id: db.id,
    contract_id: db.contract_id,
    room_id: db.room_id,
    inspection_type: db.inspection_type as InspectionImage['inspection_type'],
    image_url: db.image_url,
    image_hash: db.image_hash,
    captured_at: db.captured_at.toISOString(),
    gps_lat: db.gps_lat !== null ? parseFloat(db.gps_lat) : null,
    gps_lng: db.gps_lng !== null ? parseFloat(db.gps_lng) : null,
    device_id: db.device_id,
    note: db.note,
    image_index: db.image_index,
    uploaded_by: db.uploaded_by,
  };
}

async function fetchRooms(contractId: string, client?: PoolClient): Promise<DbRoom[]> {
  const sql = `SELECT * FROM rooms WHERE contract_id = $1 ORDER BY display_order ASC`;
  if (client) {
    const result = await client.query<DbRoom>(sql, [contractId]);
    return result.rows;
  }
  return query<DbRoom>(sql, [contractId]);
}

// ── Metadata validation ───────────────────────────────────────────────────────

function validateImageMetadata(
  contract: DbContract,
  capturedAt: string,
  gpsLat: number | null,
  gpsLng: number | null,
): void {
  // 1. Timestamp: within 1h of server time
  const timeDiff = Math.abs(Date.now() - new Date(capturedAt).getTime());
  if (timeDiff > 3_600_000) {
    throw AppError.badRequest(`Image timestamp is outside allowed range (±1h): ${capturedAt}`);
  }

  // 2. GPS: within 200m of property GPS (only if contract has GPS)
  if (
    contract.property_gps_lat !== null &&
    contract.property_gps_lng !== null &&
    gpsLat !== null &&
    gpsLng !== null
  ) {
    const distance = haversineDistance(
      parseFloat(contract.property_gps_lat),
      parseFloat(contract.property_gps_lng),
      gpsLat,
      gpsLng,
    );
    if (distance > GPS_MAX_DISTANCE_M) {
      throw AppError.badRequest(
        `Image GPS location is ${Math.round(distance)}m from the property address (max ${GPS_MAX_DISTANCE_M}m).`,
      );
    }
  }
}

// ── Upload images to Supabase Storage ────────────────────────────────────────

async function uploadImagesToStorage(
  contractId: string,
  inspectionType: 'checkin' | 'checkout',
  roomType: string,
  files: Express.Multer.File[],
): Promise<Array<{ url: string; hash: string }>> {
  const results: Array<{ url: string; hash: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const hash = sha256Buffer(file.buffer);
    const filePath = `${contractId}/${inspectionType}/${roomType}/img_${String(i + 1).padStart(3, '0')}_${hash}.jpg`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype || 'image/jpeg',
        upsert: false,
      });

    if (error) {
      throw AppError.internal(`Failed to upload image to storage: ${error.message}`);
    }

    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    results.push({ url: urlData.publicUrl, hash });
  }

  return results;
}

// ── startCheckin ──────────────────────────────────────────────────────────────

export async function startCheckin(contractId: string, actorId: string): Promise<Contract> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');
    if (actorId !== c.landlord_id) throw AppError.forbidden('Only the landlord can start check-in.');

    validateTransition(c.status as Contract['status'], 'checkin_in_progress', 'landlord');

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = 'checkin_in_progress', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(contractId, 'CHECKIN_STARTED', actorId, 'landlord', {}, client);

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}

// ── uploadCheckinImages ───────────────────────────────────────────────────────

export async function uploadCheckinImages(
  contractId: string,
  actorId: string,
  files: Express.Multer.File[],
  body: {
    room_id: string;
    captured_at: string[];
    gps_lat: number[];
    gps_lng: number[];
    device_id: string[];
    notes?: string[];
  },
): Promise<InspectionImage[]> {
  const contract = await queryOne<DbContract>(`SELECT * FROM contracts WHERE id = $1`, [contractId]);
  if (!contract) throw AppError.notFound('Contract not found.');
  if (actorId !== contract.landlord_id)
    throw AppError.forbidden('Only the landlord can upload check-in images.');
  if (contract.status !== 'checkin_in_progress') {
    throw AppError.conflict(
      `Contract must be in checkin_in_progress status, got: ${contract.status}`,
    );
  }

  const room = await queryOne<DbRoom>(
    `SELECT * FROM rooms WHERE id = $1 AND contract_id = $2`,
    [body.room_id, contractId],
  );
  if (!room) throw AppError.notFound('Room not found.');

  if (files.length === 0) throw AppError.badRequest('At least one image is required.');
  if (files.length !== body.captured_at.length) {
    throw AppError.badRequest('Number of images must match number of metadata entries.');
  }

  // Validate metadata per image
  for (let i = 0; i < files.length; i++) {
    validateImageMetadata(
      contract,
      body.captured_at[i],
      body.gps_lat[i] ?? null,
      body.gps_lng[i] ?? null,
    );
  }

  const uploaded = await uploadImagesToStorage(contractId, 'checkin', room.room_type, files);

  const imageRows: DbInspectionImage[] = [];
  for (let i = 0; i < files.length; i++) {
    const row = await queryOne<DbInspectionImage>(
      `INSERT INTO inspection_images
         (contract_id, room_id, inspection_type, image_url, image_hash,
          captured_at, gps_lat, gps_lng, device_id, note, image_index, uploaded_by)
       VALUES ($1, $2, 'checkin', $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        contractId,
        body.room_id,
        uploaded[i].url,
        uploaded[i].hash,
        body.captured_at[i],
        body.gps_lat[i] ?? null,
        body.gps_lng[i] ?? null,
        body.device_id[i],
        body.notes?.[i] ?? null,
        i,
        actorId,
      ],
    );
    if (row) {
      imageRows.push(row);
      await logAuditEvent(contractId, 'CHECKIN_IMAGE_CAPTURED', actorId, 'landlord', {
        room_id: body.room_id,
        image_index: i,
        image_hash: uploaded[i].hash,
      });
    }
  }

  return imageRows.map(toInspectionImage);
}

// ── completeCheckin ───────────────────────────────────────────────────────────

export async function completeCheckin(contractId: string, actorId: string): Promise<Contract> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');
    if (actorId !== c.landlord_id) throw AppError.forbidden('Only the landlord can complete check-in.');

    validateTransition(c.status as Contract['status'], 'checkin_pending_approval', 'landlord');

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = 'checkin_pending_approval', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(contractId, 'CHECKIN_COMPLETED', actorId, 'landlord', {}, client);

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}

// ── approveCheckin ────────────────────────────────────────────────────────────

export async function approveCheckin(contractId: string, actorId: string): Promise<Contract> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');
    if (actorId !== c.tenant_id) throw AppError.forbidden('Only the tenant can approve check-in.');

    validateTransition(c.status as Contract['status'], 'active', 'tenant');

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(contractId, 'CHECKIN_APPROVED', actorId, 'tenant', {}, client);

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}

// ── rejectCheckin ─────────────────────────────────────────────────────────────

export async function rejectCheckin(
  contractId: string,
  actorId: string,
  comment: string,
): Promise<Contract> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');
    if (actorId !== c.tenant_id) throw AppError.forbidden('Only the tenant can reject check-in.');

    validateTransition(c.status as Contract['status'], 'checkin_rejected', 'tenant');

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = 'checkin_rejected', rejection_comment = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [comment, contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(
      contractId,
      'CHECKIN_REJECTED',
      actorId,
      'tenant',
      { comment },
      client,
    );

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}

// ── getCheckinImages ──────────────────────────────────────────────────────────

export async function getCheckinImages(
  contractId: string,
  requesterId: string,
): Promise<InspectionImage[]> {
  const contract = await queryOne<{ landlord_id: string; tenant_id: string | null }>(
    `SELECT landlord_id, tenant_id FROM contracts WHERE id = $1`,
    [contractId],
  );
  if (!contract) throw AppError.notFound('Contract not found.');
  if (requesterId !== contract.landlord_id && requesterId !== contract.tenant_id) {
    throw AppError.forbidden('Access denied.');
  }

  const rows = await query<DbInspectionImage>(
    `SELECT * FROM inspection_images
     WHERE contract_id = $1 AND inspection_type = 'checkin'
     ORDER BY room_id, image_index ASC`,
    [contractId],
  );

  return rows.map(toInspectionImage);
}

// ── startCheckout ─────────────────────────────────────────────────────────────

export async function startCheckout(contractId: string, actorId: string): Promise<Contract> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');
    if (actorId !== c.tenant_id) throw AppError.forbidden('Only the tenant can start check-out.');

    validateTransition(c.status as Contract['status'], 'checkout_in_progress', 'tenant');

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = 'checkout_in_progress', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(contractId, 'CHECKOUT_STARTED', actorId, 'tenant', {}, client);

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}

// ── uploadCheckoutImages ──────────────────────────────────────────────────────

export async function uploadCheckoutImages(
  contractId: string,
  actorId: string,
  files: Express.Multer.File[],
  body: {
    room_id: string;
    captured_at: string[];
    gps_lat: number[];
    gps_lng: number[];
    device_id: string[];
    notes?: string[];
  },
): Promise<InspectionImage[]> {
  const contract = await queryOne<DbContract>(`SELECT * FROM contracts WHERE id = $1`, [contractId]);
  if (!contract) throw AppError.notFound('Contract not found.');
  if (actorId !== contract.tenant_id)
    throw AppError.forbidden('Only the tenant can upload check-out images.');
  if (contract.status !== 'checkout_in_progress') {
    throw AppError.conflict(
      `Contract must be in checkout_in_progress status, got: ${contract.status}`,
    );
  }

  const room = await queryOne<DbRoom>(
    `SELECT * FROM rooms WHERE id = $1 AND contract_id = $2`,
    [body.room_id, contractId],
  );
  if (!room) throw AppError.notFound('Room not found.');

  if (files.length === 0) throw AppError.badRequest('At least one image is required.');
  if (files.length !== body.captured_at.length) {
    throw AppError.badRequest('Number of images must match number of metadata entries.');
  }

  for (let i = 0; i < files.length; i++) {
    validateImageMetadata(
      contract,
      body.captured_at[i],
      body.gps_lat[i] ?? null,
      body.gps_lng[i] ?? null,
    );
  }

  const uploaded = await uploadImagesToStorage(contractId, 'checkout', room.room_type, files);

  const imageRows: DbInspectionImage[] = [];
  for (let i = 0; i < files.length; i++) {
    const row = await queryOne<DbInspectionImage>(
      `INSERT INTO inspection_images
         (contract_id, room_id, inspection_type, image_url, image_hash,
          captured_at, gps_lat, gps_lng, device_id, note, image_index, uploaded_by)
       VALUES ($1, $2, 'checkout', $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        contractId,
        body.room_id,
        uploaded[i].url,
        uploaded[i].hash,
        body.captured_at[i],
        body.gps_lat[i] ?? null,
        body.gps_lng[i] ?? null,
        body.device_id[i],
        body.notes?.[i] ?? null,
        i,
        actorId,
      ],
    );
    if (row) {
      imageRows.push(row);
      await logAuditEvent(contractId, 'CHECKOUT_IMAGE_CAPTURED', actorId, 'tenant', {
        room_id: body.room_id,
        image_index: i,
        image_hash: uploaded[i].hash,
      });
    }
  }

  return imageRows.map(toInspectionImage);
}

// ── completeCheckout ──────────────────────────────────────────────────────────

export async function completeCheckout(contractId: string, actorId: string): Promise<Contract> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');
    if (actorId !== c.tenant_id) throw AppError.forbidden('Only the tenant can complete check-out.');

    validateTransition(c.status as Contract['status'], 'checkout_pending_approval', 'tenant');

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = 'checkout_pending_approval', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(contractId, 'CHECKOUT_COMPLETED', actorId, 'tenant', {}, client);

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}

// ── approveCheckout ───────────────────────────────────────────────────────────

export async function approveCheckout(
  contractId: string,
  actorId: string,
): Promise<Contract> {
  const contract = await withTransaction(async (client: PoolClient) => {
    const contractResult = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = contractResult.rows[0];

    if (!c) throw AppError.notFound('Contract not found.');
    if (c.status !== 'checkout_pending_approval') {
      throw AppError.conflict(
        `Contract must be in checkout_pending_approval status, got: ${c.status}`,
      );
    }
    if (actorId !== c.landlord_id) throw AppError.forbidden('Only the landlord can approve checkout.');

    validateTransition('checkout_pending_approval', 'pending_analysis', 'landlord');

    const updatedResult = await client.query<DbContract>(
      `UPDATE contracts SET status = 'pending_analysis', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [contractId],
    );
    const updated = updatedResult.rows[0];
    if (!updated) throw AppError.internal('Failed to update contract status.');

    await logAuditEvent(contractId, 'CHECKOUT_APPROVED', actorId, 'landlord', {}, client);

    const roomsResult = await client.query<DbRoom>(
      `SELECT * FROM rooms WHERE contract_id = $1 ORDER BY display_order ASC`,
      [contractId],
    );

    return toContract(updated, roomsResult.rows);
  });

  // Fire-and-forget: run analysis in background, don't block the response
  setImmediate(() => {
    runAnalysis(contractId).catch((err) => {
      console.error(`Auto-analysis failed for contract ${contractId}:`, err);
    });
  });

  return contract;
}

// ── rejectCheckout ────────────────────────────────────────────────────────────

export async function rejectCheckout(
  contractId: string,
  actorId: string,
  comment: string,
): Promise<Contract> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');
    if (actorId !== c.landlord_id)
      throw AppError.forbidden('Only the landlord can reject checkout.');

    validateTransition(c.status as Contract['status'], 'checkout_rejected', 'landlord');

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = 'checkout_rejected', rejection_comment = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [comment, contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(
      contractId,
      'CHECKOUT_REJECTED',
      actorId,
      'landlord',
      { comment },
      client,
    );

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}
