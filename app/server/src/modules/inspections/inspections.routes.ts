import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/middleware/errorHandler.js';
import { AppError } from '../../shared/utils/errors.js';
import {
  startCheckin,
  uploadCheckinImages,
  completeCheckin,
  approveCheckin,
  rejectCheckin,
  getCheckinImages,
  startCheckout,
  uploadCheckoutImages,
  completeCheckout,
  approveCheckout,
  rejectCheckout,
} from './inspections.service.js';

export const inspectionsRouter = Router();

// multer: store files in memory for Supabase upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 }, // 20MB per file, max 10 files
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
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

// ── Check-in routes ───────────────────────────────────────────────────────────

// POST /api/v1/contracts/:id/checkin/start
inspectionsRouter.post(
  '/:id/checkin/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contract = await startCheckin(req.params.id, req.user!.id);
    res.json({ contract });
  }),
);

// POST /api/v1/contracts/:id/checkin/images
inspectionsRouter.post(
  '/:id/checkin/images',
  requireAuth,
  upload.array('images[]'),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) throw AppError.badRequest('No images uploaded.');
    const metadata = parseImageMetadata(req.body as Record<string, unknown>, files.length);
    const images = await uploadCheckinImages(req.params.id, req.user!.id, files, metadata);
    res.json({ images });
  }),
);

// POST /api/v1/contracts/:id/checkin/complete
inspectionsRouter.post(
  '/:id/checkin/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contract = await completeCheckin(req.params.id, req.user!.id);
    res.json({ contract });
  }),
);

// POST /api/v1/contracts/:id/checkin/approve
inspectionsRouter.post(
  '/:id/checkin/approve',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contract = await approveCheckin(req.params.id, req.user!.id);
    res.json({ contract });
  }),
);

// POST /api/v1/contracts/:id/checkin/reject
inspectionsRouter.post(
  '/:id/checkin/reject',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = rejectBodySchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest('comment is required (1-500 chars).');
    const contract = await rejectCheckin(req.params.id, req.user!.id, parsed.data.comment);
    res.json({ contract });
  }),
);

// GET /api/v1/contracts/:id/checkin/images
inspectionsRouter.get(
  '/:id/checkin/images',
  requireAuth,
  asyncHandler(async (req, res) => {
    const images = await getCheckinImages(req.params.id, req.user!.id);
    res.json({ images });
  }),
);

// ── Check-out routes ──────────────────────────────────────────────────────────

// POST /api/v1/contracts/:id/checkout/start
inspectionsRouter.post(
  '/:id/checkout/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contract = await startCheckout(req.params.id, req.user!.id);
    res.json({ contract });
  }),
);

// POST /api/v1/contracts/:id/checkout/images
inspectionsRouter.post(
  '/:id/checkout/images',
  requireAuth,
  upload.array('images[]'),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) throw AppError.badRequest('No images uploaded.');
    const metadata = parseImageMetadata(req.body as Record<string, unknown>, files.length);
    const images = await uploadCheckoutImages(req.params.id, req.user!.id, files, metadata);
    res.json({ images });
  }),
);

// POST /api/v1/contracts/:id/checkout/complete
inspectionsRouter.post(
  '/:id/checkout/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contract = await completeCheckout(req.params.id, req.user!.id);
    res.json({ contract });
  }),
);

// POST /api/v1/contracts/:id/checkout/approve
inspectionsRouter.post(
  '/:id/checkout/approve',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contract = await approveCheckout(req.params.id, req.user!.id);
    res.json({ contract });
  }),
);

// POST /api/v1/contracts/:id/checkout/reject
inspectionsRouter.post(
  '/:id/checkout/reject',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = rejectBodySchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest('comment is required (1-500 chars).');
    const contract = await rejectCheckout(req.params.id, req.user!.id, parsed.data.comment);
    res.json({ contract });
  }),
);
