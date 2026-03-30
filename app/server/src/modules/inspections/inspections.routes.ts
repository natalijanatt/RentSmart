import { Router } from 'express';
import multer from 'multer';

import { requireAuth } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/middleware/errorHandler.js';
import { validate } from '../../shared/middleware/validate.js';
import { rejectInspectionSchema } from './inspections.schema.js';
import {
  approveInspection,
  completeInspection,
  getInspectionImages,
  rejectInspection,
  startInspection,
  uploadRoomImages,
} from './inspections.service.js';
import type { ImageMetadata } from './inspections.service.js';

export const inspectionsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per image
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  },
});

inspectionsRouter.use(requireAuth);

// ── Helper: parse per-image metadata arrays from multipart body ──────────────

function parseMetadata(body: Record<string, unknown>, fileCount: number): ImageMetadata[] {
  const toArray = (val: unknown): string[] => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') return [val];
    return [];
  };

  const capturedAt = toArray(body['captured_at[]'] ?? body.captured_at);
  const gpsLat = toArray(body['gps_lat[]'] ?? body.gps_lat);
  const gpsLng = toArray(body['gps_lng[]'] ?? body.gps_lng);
  const deviceId = toArray(body['device_id[]'] ?? body.device_id);
  const notes = toArray(body['notes[]'] ?? body.notes);

  const metadata: ImageMetadata[] = [];
  for (let i = 0; i < fileCount; i++) {
    metadata.push({
      captured_at: capturedAt[i] ?? new Date().toISOString(),
      gps_lat: parseFloat(gpsLat[i] ?? '0'),
      gps_lng: parseFloat(gpsLng[i] ?? '0'),
      device_id: deviceId[i] ?? 'unknown',
      note: notes[i] || undefined,
    });
  }
  return metadata;
}

// ── Check-in routes ──────────────────────────────────────────────────────────

inspectionsRouter.post(
  '/:id/checkin/start',
  asyncHandler(async (req, res) => {
    await startInspection(req.params.id as string, req.user!.id, 'checkin');
    res.json({ status: 'checkin_in_progress' });
  }),
);

inspectionsRouter.post(
  '/:id/checkin/images',
  upload.array('images', 10),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const metadata = parseMetadata(req.body, files.length);
    const images = await uploadRoomImages(
      req.params.id as string, req.user!.id, 'checkin',
      req.body.room_id as string, files, metadata,
    );
    res.status(201).json({ images });
  }),
);

inspectionsRouter.post(
  '/:id/checkin/complete',
  asyncHandler(async (req, res) => {
    await completeInspection(req.params.id as string, req.user!.id, 'checkin');
    res.json({ status: 'checkin_pending_approval' });
  }),
);

inspectionsRouter.post(
  '/:id/checkin/approve',
  asyncHandler(async (req, res) => {
    await approveInspection(req.params.id as string, req.user!.id, 'checkin');
    res.json({ status: 'active' });
  }),
);

inspectionsRouter.post(
  '/:id/checkin/reject',
  validate(rejectInspectionSchema),
  asyncHandler(async (req, res) => {
    await rejectInspection(req.params.id as string, req.user!.id, 'checkin', req.body.comment);
    res.json({ status: 'checkin_rejected' });
  }),
);

inspectionsRouter.get(
  '/:id/checkin/images',
  asyncHandler(async (req, res) => {
    const images = await getInspectionImages(req.params.id as string, req.user!.id, 'checkin');
    res.json({ images });
  }),
);

// ── Check-out routes ─────────────────────────────────────────────────────────

inspectionsRouter.post(
  '/:id/checkout/start',
  asyncHandler(async (req, res) => {
    await startInspection(req.params.id as string, req.user!.id, 'checkout');
    res.json({ status: 'checkout_in_progress' });
  }),
);

inspectionsRouter.post(
  '/:id/checkout/images',
  upload.array('images', 10),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const metadata = parseMetadata(req.body, files.length);
    const images = await uploadRoomImages(
      req.params.id as string, req.user!.id, 'checkout',
      req.body.room_id as string, files, metadata,
    );
    res.status(201).json({ images });
  }),
);

inspectionsRouter.post(
  '/:id/checkout/complete',
  asyncHandler(async (req, res) => {
    await completeInspection(req.params.id as string, req.user!.id, 'checkout');
    res.json({ status: 'checkout_pending_approval' });
  }),
);

inspectionsRouter.post(
  '/:id/checkout/approve',
  asyncHandler(async (req, res) => {
    await approveInspection(req.params.id as string, req.user!.id, 'checkout');
    res.json({ status: 'pending_analysis' });
  }),
);

inspectionsRouter.post(
  '/:id/checkout/reject',
  validate(rejectInspectionSchema),
  asyncHandler(async (req, res) => {
    await rejectInspection(req.params.id as string, req.user!.id, 'checkout', req.body.comment);
    res.json({ status: 'checkout_rejected' });
  }),
);

inspectionsRouter.get(
  '/:id/checkout/images',
  asyncHandler(async (req, res) => {
    const images = await getInspectionImages(req.params.id as string, req.user!.id, 'checkout');
    res.json({ images });
  }),
);
