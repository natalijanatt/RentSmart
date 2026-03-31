import type { PoolClient } from 'pg';

import type { AuditEventType, Contract, ContractStatus, InspectionImage, InspectionType } from '@rentsmart/contracts';

import { withTransaction, query, queryOne } from '../../shared/db/index.js';
import { supabase, STORAGE_BUCKET } from '../../shared/db/supabase.js';
import type { DbContract, DbInspectionImage, DbRoom } from '../../shared/types/index.js';
import { AppError } from '../../shared/utils/errors.js';
import { haversineDistance, GPS_MAX_DISTANCE_M } from '../../shared/utils/geo.js';
import { sha256Buffer } from '../../shared/utils/hash.js';
import { toContract } from '../../shared/utils/mappers.js';
import { logAuditEvent } from '../audit/audit.service.js';
import { validateTransition } from '../contracts/state-machine.js';

// ── Inspection config per type ───────────────────────────────────────────────

interface InspectionConfig {
  startActor: 'landlord' | 'tenant';
  uploadActor: 'landlord' | 'tenant';
  completeActor: 'landlord' | 'tenant';
  approveActor: 'landlord' | 'tenant';
  rejectActor: 'landlord' | 'tenant';
  inProgressStatus: ContractStatus;
  pendingApprovalStatus: ContractStatus;
  approvedTargetStatus: ContractStatus;
  rejectedStatus: ContractStatus;
  startEvent: AuditEventType;
  completeEvent: AuditEventType;
  approveEvent: AuditEventType;
  rejectEvent: AuditEventType;
  imageCapturedEvent: AuditEventType;
}

const INSPECTION_CONFIG: Record<InspectionType, InspectionConfig> = {
  checkin: {
    startActor: 'landlord',
    uploadActor: 'landlord',
    completeActor: 'landlord',
    approveActor: 'tenant',
    rejectActor: 'tenant',
    inProgressStatus: 'checkin_in_progress',
    pendingApprovalStatus: 'checkin_pending_approval',
    approvedTargetStatus: 'active',
    rejectedStatus: 'checkin_rejected',
    startEvent: 'CHECKIN_STARTED',
    completeEvent: 'CHECKIN_COMPLETED',
    approveEvent: 'CHECKIN_APPROVED',
    rejectEvent: 'CHECKIN_REJECTED',
    imageCapturedEvent: 'CHECKIN_IMAGE_CAPTURED',
  },
  checkout: {
    startActor: 'tenant',
    uploadActor: 'tenant',
    completeActor: 'tenant',
    approveActor: 'landlord',
    rejectActor: 'landlord',
    inProgressStatus: 'checkout_in_progress',
    pendingApprovalStatus: 'checkout_pending_approval',
    approvedTargetStatus: 'pending_analysis',
    rejectedStatus: 'checkout_rejected',
    startEvent: 'CHECKOUT_STARTED',
    completeEvent: 'CHECKOUT_COMPLETED',
    approveEvent: 'CHECKOUT_APPROVED',
    rejectEvent: 'CHECKOUT_REJECTED',
    imageCapturedEvent: 'CHECKOUT_IMAGE_CAPTURED',
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function getActorId(contract: DbContract, role: 'landlord' | 'tenant'): string | null {
  return role === 'landlord' ? contract.landlord_id : contract.tenant_id;
}

function assertActor(actorId: string, contract: DbContract, role: 'landlord' | 'tenant', action: string): void {
  const expected = getActorId(contract, role);
  if (actorId !== expected) {
    throw AppError.forbidden(`Only the ${role} can ${action}.`);
  }
}

// ── Metadata validation ─────────────────────────────────────────────────────

function validateImageMetadata(
  contract: DbContract,
  capturedAt: string,
  gpsLat: number | null,
  gpsLng: number | null,
): void {
  const timeDiff = Math.abs(Date.now() - new Date(capturedAt).getTime());
  if (timeDiff > 3_600_000) {
    throw AppError.badRequest(`Image timestamp is outside allowed range (±1h): ${capturedAt}`);
  }

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

// ── Upload images to Supabase Storage ───────────────────────────────────────

async function uploadImagesToStorage(
  contractId: string,
  inspectionType: InspectionType,
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

// ── Generic inspection operations ───────────────────────────────────────────

export async function startInspection(
  contractId: string,
  actorId: string,
  type: InspectionType,
): Promise<Contract> {
  const cfg = INSPECTION_CONFIG[type];

  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');

    assertActor(actorId, c, cfg.startActor, `start ${type === 'checkin' ? 'check-in' : 'check-out'}`);
    validateTransition(c.status as Contract['status'], cfg.inProgressStatus, cfg.startActor);

    // If restarting after rejection, delete old images and clear rejection_comment
    const isRejectionRestart = c.status === cfg.rejectedStatus;
    if (isRejectionRestart) {
      await client.query(
        `DELETE FROM inspection_images WHERE contract_id = $1 AND inspection_type = $2`,
        [contractId, type],
      );
    }

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = $1, rejection_comment = ${isRejectionRestart ? 'NULL' : 'rejection_comment'}, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [cfg.inProgressStatus, contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(contractId, cfg.startEvent, actorId, cfg.startActor, {}, client);

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}

export async function uploadInspectionImages(
  contractId: string,
  actorId: string,
  type: InspectionType,
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
  const cfg = INSPECTION_CONFIG[type];

  const contract = await queryOne<DbContract>(`SELECT * FROM contracts WHERE id = $1`, [contractId]);
  if (!contract) throw AppError.notFound('Contract not found.');

  assertActor(actorId, contract, cfg.uploadActor, `upload ${type === 'checkin' ? 'check-in' : 'check-out'} images`);

  if (contract.status !== cfg.inProgressStatus) {
    throw AppError.conflict(
      `Contract must be in ${cfg.inProgressStatus} status, got: ${contract.status}`,
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

  // Validate device consistency: all images in this inspection must come from the same device
  const existingDevice = await queryOne<{ device_id: string }>(
    `SELECT DISTINCT device_id FROM inspection_images
     WHERE contract_id = $1 AND inspection_type = $2
     LIMIT 1`,
    [contractId, type],
  );
  const expectedDeviceId = existingDevice?.device_id ?? body.device_id[0];
  for (const deviceId of body.device_id) {
    if (deviceId !== expectedDeviceId) {
      throw AppError.badRequest(
        `All images in an inspection must come from the same device. Expected "${expectedDeviceId}", got "${deviceId}".`,
      );
    }
  }

  // Query existing image count so new indices don't collide with prior uploads
  const existing = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM inspection_images
     WHERE contract_id = $1 AND room_id = $2 AND inspection_type = $3`,
    [contractId, body.room_id, type],
  );
  const indexOffset = parseInt(existing[0]?.count ?? '0', 10);

  const uploaded = await uploadImagesToStorage(contractId, type, room.room_type, files);

  const imageRows: DbInspectionImage[] = [];
  for (let i = 0; i < files.length; i++) {
    const imageIndex = indexOffset + i;
    const row = await queryOne<DbInspectionImage>(
      `INSERT INTO inspection_images
         (contract_id, room_id, inspection_type, image_url, image_hash,
          captured_at, gps_lat, gps_lng, device_id, note, image_index, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        contractId,
        body.room_id,
        type,
        uploaded[i].url,
        uploaded[i].hash,
        body.captured_at[i],
        body.gps_lat[i] ?? null,
        body.gps_lng[i] ?? null,
        body.device_id[i],
        body.notes?.[i] ?? null,
        imageIndex,
        actorId,
      ],
    );
    if (row) {
      imageRows.push(row);
      await logAuditEvent(contractId, cfg.imageCapturedEvent, actorId, cfg.uploadActor, {
        room_id: body.room_id,
        image_index: imageIndex,
        image_hash: uploaded[i].hash,
      });
    }
  }

  return imageRows.map(toInspectionImage);
}

export async function completeInspection(
  contractId: string,
  actorId: string,
  type: InspectionType,
): Promise<Contract> {
  const cfg = INSPECTION_CONFIG[type];

  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');

    assertActor(actorId, c, cfg.completeActor, `complete ${type === 'checkin' ? 'check-in' : 'check-out'}`);
    validateTransition(c.status as Contract['status'], cfg.pendingApprovalStatus, cfg.completeActor);

    // Validate all mandatory rooms have ≥3 images
    const mandatoryRooms = await client.query<DbRoom>(
      `SELECT * FROM rooms WHERE contract_id = $1 AND is_mandatory = true`,
      [contractId],
    );
    for (const room of mandatoryRooms.rows) {
      const imgCount = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM inspection_images
         WHERE contract_id = $1 AND room_id = $2 AND inspection_type = $3`,
        [contractId, room.id, type],
      );
      const count = parseInt(imgCount.rows[0]?.count ?? '0', 10);
      if (count < 3) {
        throw AppError.badRequest(
          `Mandatory room "${room.custom_name ?? room.room_type}" requires at least 3 images (has ${count}).`,
        );
      }
    }

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [cfg.pendingApprovalStatus, contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(contractId, cfg.completeEvent, actorId, cfg.completeActor, {}, client);

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}

export async function approveInspection(
  contractId: string,
  actorId: string,
  type: InspectionType,
): Promise<Contract> {
  const cfg = INSPECTION_CONFIG[type];

  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');

    assertActor(actorId, c, cfg.approveActor, `approve ${type === 'checkin' ? 'check-in' : 'check-out'}`);
    validateTransition(c.status as Contract['status'], cfg.approvedTargetStatus, cfg.approveActor);

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [cfg.approvedTargetStatus, contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(contractId, cfg.approveEvent, actorId, cfg.approveActor, {}, client);

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}

export async function rejectInspection(
  contractId: string,
  actorId: string,
  type: InspectionType,
  comment: string,
): Promise<Contract> {
  const cfg = INSPECTION_CONFIG[type];

  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const c = result.rows[0];
    if (!c) throw AppError.notFound('Contract not found.');

    assertActor(actorId, c, cfg.rejectActor, `reject ${type === 'checkin' ? 'check-in' : 'check-out'}`);
    validateTransition(c.status as Contract['status'], cfg.rejectedStatus, cfg.rejectActor);

    const updated = await client.query<DbContract>(
      `UPDATE contracts SET status = $1, rejection_comment = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [cfg.rejectedStatus, comment, contractId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw AppError.internal('Failed to update contract.');

    await logAuditEvent(
      contractId,
      cfg.rejectEvent,
      actorId,
      cfg.rejectActor,
      { comment },
      client,
    );

    const rooms = await fetchRooms(contractId, client);
    return toContract(updatedRow, rooms);
  });
}

export async function getInspectionImages(
  contractId: string,
  requesterId: string,
  type: InspectionType,
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
     WHERE contract_id = $1 AND inspection_type = $2
     ORDER BY room_id, image_index ASC`,
    [contractId, type],
  );

  return rows.map(toInspectionImage);
}
