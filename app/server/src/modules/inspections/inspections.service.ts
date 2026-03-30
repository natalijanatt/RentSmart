import type { ContractStatus, InspectionImage, InspectionType } from '@rentsmart/contracts';

import { query, queryOne, withTransaction } from '../../shared/db/index.js';
import type {
  DbContract,
  DbInspectionImage,
  DbRoom,
} from '../../shared/types/index.js';
import { AppError } from '../../shared/utils/errors.js';
import { logAuditEvent } from '../audit/audit.service.js';
import { validateTransition } from '../contracts/state-machine.js';
import { uploadImage } from './image.service.js';
import { validateImageMetadata } from './metadata-validator.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveRole(contract: DbContract, userId: string): 'landlord' | 'tenant' {
  if (userId === contract.landlord_id) return 'landlord';
  if (userId === contract.tenant_id) return 'tenant';
  throw AppError.forbidden('Access denied.');
}

function toInspectionImage(db: DbInspectionImage): InspectionImage {
  return {
    id: db.id,
    contract_id: db.contract_id,
    room_id: db.room_id,
    inspection_type: db.inspection_type as InspectionType,
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

// Determine expected status for a given inspection action
function getExpectedStatus(type: InspectionType, action: string): ContractStatus {
  const statusMap: Record<string, ContractStatus> = {
    'checkin:start': 'accepted',
    'checkin:start_rejected': 'checkin_rejected',
    'checkin:upload': 'checkin_in_progress',
    'checkin:complete': 'checkin_in_progress',
    'checkin:approve': 'checkin_pending_approval',
    'checkin:reject': 'checkin_pending_approval',
    'checkout:start': 'active',
    'checkout:start_rejected': 'checkout_rejected',
    'checkout:upload': 'checkout_in_progress',
    'checkout:complete': 'checkout_in_progress',
    'checkout:approve': 'checkout_pending_approval',
    'checkout:reject': 'checkout_pending_approval',
  };
  return statusMap[`${type}:${action}`]!;
}

// Who photographs, who reviews
function getPhotographer(type: InspectionType): 'landlord' | 'tenant' {
  return type === 'checkin' ? 'landlord' : 'tenant';
}
function getReviewer(type: InspectionType): 'landlord' | 'tenant' {
  return type === 'checkin' ? 'tenant' : 'landlord';
}

// ── startInspection ──────────────────────────────────────────────────────────

export async function startInspection(
  contractId: string,
  userId: string,
  type: InspectionType,
): Promise<void> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`, [contractId],
    );
    const contract = result.rows[0];
    if (!contract) throw AppError.notFound('Contract not found.');

    const role = resolveRole(contract, userId);
    const expectedRole = getPhotographer(type);
    if (role !== expectedRole) {
      throw AppError.forbidden(`Only ${expectedRole} can start ${type}.`);
    }

    const targetStatus: ContractStatus = type === 'checkin'
      ? 'checkin_in_progress'
      : 'checkout_in_progress';

    // Allow start from either initial state or rejected state
    const currentStatus = contract.status as ContractStatus;
    const expectedStart = getExpectedStatus(type, 'start');
    const expectedRejected = getExpectedStatus(type, 'start_rejected');

    if (currentStatus !== expectedStart && currentStatus !== expectedRejected) {
      throw AppError.conflict(
        `Cannot start ${type}: contract is in ${currentStatus}, expected ${expectedStart} or ${expectedRejected}`,
      );
    }

    validateTransition(currentStatus, targetStatus, role);

    // If restarting after rejection, delete old images for this inspection type
    if (currentStatus === expectedRejected) {
      await client.query(
        `DELETE FROM inspection_images WHERE contract_id = $1 AND inspection_type = $2`,
        [contractId, type],
      );
    }

    await client.query(
      `UPDATE contracts SET status = $1, rejection_comment = NULL, updated_at = NOW() WHERE id = $2`,
      [targetStatus, contractId],
    );

    const eventType = type === 'checkin' ? 'CHECKIN_STARTED' : 'CHECKOUT_STARTED';
    await logAuditEvent(contractId, eventType, userId, role, {}, client);
  });
}

// ── uploadRoomImages ─────────────────────────────────────────────────────────

export interface ImageMetadata {
  captured_at: string;
  gps_lat: number;
  gps_lng: number;
  device_id: string;
  note?: string;
}

export async function uploadRoomImages(
  contractId: string,
  userId: string,
  type: InspectionType,
  roomId: string,
  files: Express.Multer.File[],
  metadata: ImageMetadata[],
): Promise<InspectionImage[]> {
  if (files.length === 0) throw AppError.badRequest('No images provided.');
  if (files.length > 10) throw AppError.badRequest('Maximum 10 images per room per upload.');
  if (files.length !== metadata.length) {
    throw AppError.badRequest('Number of images must match number of metadata entries.');
  }

  const contract = await queryOne<DbContract>(
    `SELECT * FROM contracts WHERE id = $1`, [contractId],
  );
  if (!contract) throw AppError.notFound('Contract not found.');

  const role = resolveRole(contract, userId);
  if (role !== getPhotographer(type)) {
    throw AppError.forbidden(`Only ${getPhotographer(type)} can upload ${type} images.`);
  }

  const expectedStatus = getExpectedStatus(type, 'upload');
  if (contract.status !== expectedStatus) {
    throw AppError.conflict(`Contract must be in ${expectedStatus} status for image upload.`);
  }

  // Verify room belongs to this contract
  const room = await queryOne<DbRoom>(
    `SELECT * FROM rooms WHERE id = $1 AND contract_id = $2`, [roomId, contractId],
  );
  if (!room) throw AppError.notFound('Room not found for this contract.');

  // Contract GPS for metadata validation
  const contractGps = contract.property_gps_lat && contract.property_gps_lng
    ? { lat: parseFloat(contract.property_gps_lat), lng: parseFloat(contract.property_gps_lng) }
    : null;

  // Get existing image count for this room to determine index offset
  const existingImages = await query<{ id: string }>(
    `SELECT id FROM inspection_images WHERE contract_id = $1 AND room_id = $2 AND inspection_type = $3`,
    [contractId, roomId, type],
  );
  const indexOffset = existingImages.length;

  // Determine session device_id from first image already uploaded in this session
  const sessionDevice = await queryOne<{ device_id: string }>(
    `SELECT device_id FROM inspection_images WHERE contract_id = $1 AND inspection_type = $2 LIMIT 1`,
    [contractId, type],
  );

  const results: InspectionImage[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const meta = metadata[i]!;

    // Validate metadata
    const validation = validateImageMetadata(
      contractGps,
      meta,
      sessionDevice?.device_id ?? (i === 0 ? null : metadata[0]!.device_id),
    );
    if (!validation.valid) {
      throw AppError.badRequest(`Image ${i + 1} metadata invalid: ${validation.errors.join('; ')}`);
    }

    // Upload to Supabase Storage
    const roomType = room.custom_name || room.room_type;
    const imageIndex = indexOffset + i;
    const { url, hash } = await uploadImage(contractId, type, roomType, file.buffer, imageIndex);

    // Insert DB row
    const row = await queryOne<DbInspectionImage>(
      `INSERT INTO inspection_images
         (contract_id, room_id, inspection_type, image_url, image_hash,
          captured_at, gps_lat, gps_lng, device_id, note, image_index, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        contractId, roomId, type, url, hash,
        meta.captured_at, meta.gps_lat, meta.gps_lng,
        meta.device_id, meta.note ?? null, imageIndex, userId,
      ],
    );
    if (!row) throw AppError.internal('Failed to insert inspection image.');

    results.push(toInspectionImage(row));

    const eventType = type === 'checkin' ? 'CHECKIN_IMAGE_CAPTURED' : 'CHECKOUT_IMAGE_CAPTURED';
    await logAuditEvent(contractId, eventType, userId, role, {
      room_id: roomId,
      image_index: imageIndex,
      image_hash: hash,
    });
  }

  return results;
}

// ── completeInspection ───────────────────────────────────────────────────────

export async function completeInspection(
  contractId: string,
  userId: string,
  type: InspectionType,
): Promise<void> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`, [contractId],
    );
    const contract = result.rows[0];
    if (!contract) throw AppError.notFound('Contract not found.');

    const role = resolveRole(contract, userId);
    if (role !== getPhotographer(type)) {
      throw AppError.forbidden(`Only ${getPhotographer(type)} can complete ${type}.`);
    }

    const expectedStatus = getExpectedStatus(type, 'complete');
    if (contract.status !== expectedStatus) {
      throw AppError.conflict(`Contract must be in ${expectedStatus} to complete ${type}.`);
    }

    // Validate all mandatory rooms have ≥3 images
    const mandatoryRooms = await query<DbRoom>(
      `SELECT * FROM rooms WHERE contract_id = $1 AND is_mandatory = true`,
      [contractId],
    );

    for (const room of mandatoryRooms) {
      const imgResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM inspection_images
         WHERE contract_id = $1 AND room_id = $2 AND inspection_type = $3`,
        [contractId, room.id, type],
      );
      const count = parseInt(imgResult.rows[0]?.count ?? '0', 10);
      const roomName = room.custom_name || room.room_type;
      if (count < 3) {
        throw AppError.badRequest(
          `Room "${roomName}" requires at least 3 images, has ${count}.`,
        );
      }
    }

    const targetStatus: ContractStatus = type === 'checkin'
      ? 'checkin_pending_approval'
      : 'checkout_pending_approval';

    validateTransition(contract.status as ContractStatus, targetStatus, role);

    await client.query(
      `UPDATE contracts SET status = $1, updated_at = NOW() WHERE id = $2`,
      [targetStatus, contractId],
    );

    const eventType = type === 'checkin' ? 'CHECKIN_COMPLETED' : 'CHECKOUT_COMPLETED';
    await logAuditEvent(contractId, eventType, userId, role, {
      total_images: mandatoryRooms.length,
    }, client);
  });
}

// ── approveInspection ────────────────────────────────────────────────────────

export async function approveInspection(
  contractId: string,
  userId: string,
  type: InspectionType,
): Promise<void> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`, [contractId],
    );
    const contract = result.rows[0];
    if (!contract) throw AppError.notFound('Contract not found.');

    const role = resolveRole(contract, userId);
    if (role !== getReviewer(type)) {
      throw AppError.forbidden(`Only ${getReviewer(type)} can approve ${type}.`);
    }

    const currentStatus = contract.status as ContractStatus;
    const expectedStatus = getExpectedStatus(type, 'approve');
    if (currentStatus !== expectedStatus) {
      throw AppError.conflict(`Contract must be in ${expectedStatus} to approve ${type}.`);
    }

    const targetStatus: ContractStatus = type === 'checkin'
      ? 'active'
      : 'pending_analysis';

    validateTransition(currentStatus, targetStatus, role);

    await client.query(
      `UPDATE contracts SET status = $1, updated_at = NOW() WHERE id = $2`,
      [targetStatus, contractId],
    );

    const eventType = type === 'checkin' ? 'CHECKIN_APPROVED' : 'CHECKOUT_APPROVED';
    await logAuditEvent(contractId, eventType, userId, role, {}, client);

    // Auto-trigger analysis after checkout approval
    // NOTE: The caller (routes) should fire POST /contracts/:id/analyze after this returns.
    // We don't call runAnalysis() here to keep the inspections module independent of analysis.
  });
}

// ── rejectInspection ─────────────────────────────────────────────────────────

export async function rejectInspection(
  contractId: string,
  userId: string,
  type: InspectionType,
  comment: string,
): Promise<void> {
  return withTransaction(async (client) => {
    const result = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`, [contractId],
    );
    const contract = result.rows[0];
    if (!contract) throw AppError.notFound('Contract not found.');

    const role = resolveRole(contract, userId);
    if (role !== getReviewer(type)) {
      throw AppError.forbidden(`Only ${getReviewer(type)} can reject ${type}.`);
    }

    const currentStatus = contract.status as ContractStatus;
    const expectedStatus = getExpectedStatus(type, 'reject');
    if (currentStatus !== expectedStatus) {
      throw AppError.conflict(`Contract must be in ${expectedStatus} to reject ${type}.`);
    }

    const targetStatus: ContractStatus = type === 'checkin'
      ? 'checkin_rejected'
      : 'checkout_rejected';

    validateTransition(currentStatus, targetStatus, role);

    await client.query(
      `UPDATE contracts SET status = $1, rejection_comment = $2, updated_at = NOW() WHERE id = $3`,
      [targetStatus, comment, contractId],
    );

    const eventType = type === 'checkin' ? 'CHECKIN_REJECTED' : 'CHECKOUT_REJECTED';
    await logAuditEvent(contractId, eventType, userId, role, { comment }, client);
  });
}

// ── getInspectionImages ──────────────────────────────────────────────────────

export async function getInspectionImages(
  contractId: string,
  userId: string,
  type: InspectionType,
): Promise<InspectionImage[]> {
  const contract = await queryOne<DbContract>(
    `SELECT * FROM contracts WHERE id = $1`, [contractId],
  );
  if (!contract) throw AppError.notFound('Contract not found.');
  resolveRole(contract, userId);

  const rows = await query<DbInspectionImage>(
    `SELECT * FROM inspection_images
     WHERE contract_id = $1 AND inspection_type = $2
     ORDER BY room_id, image_index ASC`,
    [contractId, type],
  );

  return rows.map(toInspectionImage);
}
