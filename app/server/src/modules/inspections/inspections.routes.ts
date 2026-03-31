import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';

import type { InspectionType } from '@rentsmart/contracts';

import { requireAuth } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/middleware/errorHandler.js';
import { AppError } from '../../shared/utils/errors.js';
import {
  startInspection,
  uploadInspectionImages,
  completeInspection,
  approveInspection,
  rejectInspection,
  getInspectionImages,
} from './inspections.service.js';

export const inspectionsRouter = Router();

// multer: store files in memory for Supabase upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10MB per file, max 10 files
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/png') {
      return cb(new Error('Only JPEG and PNG images are allowed'));
    }
    cb(null, true);
  },
});

const rejectBodySchema = z.object({ comment: z.string().min(1).max(500) });

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseImageMetadata(body: Record<string, unknown>, fileCount: number) {
  // Form-data fields arrive as strings or arrays; normalize to arrays
  const toArray = (val: unknown): string[] => {
    if (Array.isArray(val)) return val.map(String);
    if (val !== undefined && val !== null) return [String(val)];
    return [];
  };

  const toNumberArray = (val: unknown): number[] => {
    if (Array.isArray(val)) return val.map(Number);
    if (val !== undefined && val !== null) return [Number(val)];
    return [];
  };

  const captured_at = toArray(body.captured_at);
  const gps_lat = toNumberArray(body.gps_lat);
  const gps_lng = toNumberArray(body.gps_lng);
  const device_id = toArray(body.device_id);
  const notes = toArray(body.notes);
  const room_id = typeof body.room_id === 'string' ? body.room_id : null;

  if (!room_id) throw AppError.badRequest('room_id is required.');
  if (captured_at.length !== fileCount)
    throw AppError.badRequest('captured_at must have one entry per image.');
  if (gps_lat.length !== fileCount)
    throw AppError.badRequest('gps_lat must have one entry per image.');
  if (gps_lng.length !== fileCount)
    throw AppError.badRequest('gps_lng must have one entry per image.');
  if (device_id.length !== fileCount)
    throw AppError.badRequest('device_id must have one entry per image.');

  return {
    room_id,
    captured_at,
    gps_lat,
    gps_lng,
    device_id,
    notes: notes.length > 0 ? notes : undefined,
  };
}

// ── Generic inspection route factory ──────────────────────────────────────────

function registerInspectionRoutes(type: InspectionType): void {
  const typeStr = type === 'checkin' ? 'checkin' : 'checkout';

  // POST /api/v1/contracts/:id/{checkin|checkout}/start
  inspectionsRouter.post(
    `/:id/${typeStr}/start`,
    requireAuth,
    asyncHandler(async (req, res) => {
      const contractId = req.params.id as string;
      const contract = await startInspection(contractId, req.user!.id, type);
      res.json({ contract });
    }),
  );

  // POST /api/v1/contracts/:id/{checkin|checkout}/images
  inspectionsRouter.post(
    `/:id/${typeStr}/images`,
    requireAuth,
    upload.array('images', 10),
    asyncHandler(async (req, res) => {
      const contractId = req.params.id as string;
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) throw AppError.badRequest('No images uploaded.');
      const metadata = parseImageMetadata(req.body as Record<string, unknown>, files.length);
      const images = await uploadInspectionImages(contractId, req.user!.id, type, files, metadata);
      res.json({ images });
    }),
  );

  // POST /api/v1/contracts/:id/{checkin|checkout}/complete
  inspectionsRouter.post(
    `/:id/${typeStr}/complete`,
    requireAuth,
    asyncHandler(async (req, res) => {
      const contractId = req.params.id as string;
      const contract = await completeInspection(contractId, req.user!.id, type);
      res.json({ contract });
    }),
  );

  // POST /api/v1/contracts/:id/{checkin|checkout}/approve
  inspectionsRouter.post(
    `/:id/${typeStr}/approve`,
    requireAuth,
    asyncHandler(async (req, res) => {
      const contractId = req.params.id as string;
      const contract = await approveInspection(contractId, req.user!.id, type);
      res.json({ contract });
    }),
  );

  // POST /api/v1/contracts/:id/{checkin|checkout}/reject
  inspectionsRouter.post(
    `/:id/${typeStr}/reject`,
    requireAuth,
    asyncHandler(async (req, res) => {
      const contractId = req.params.id as string;
      const parsed = rejectBodySchema.safeParse(req.body);
      if (!parsed.success) throw AppError.badRequest('comment is required (1-500 chars).');
      const contract = await rejectInspection(contractId, req.user!.id, type, parsed.data.comment);
      res.json({ contract });
    }),
  );

  // GET /api/v1/contracts/:id/{checkin|checkout}/images
  inspectionsRouter.get(
    `/:id/${typeStr}/images`,
    requireAuth,
    asyncHandler(async (req, res) => {
      const contractId = req.params.id as string;
      const images = await getInspectionImages(contractId, req.user!.id, type);
      res.json({ images });
    }),
  );
}

// Register routes for both inspection types
registerInspectionRoutes('checkin');
registerInspectionRoutes('checkout');
