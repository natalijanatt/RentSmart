import { z } from 'zod';

import { inspectionTypeSchema } from './shared';

export const inspectionImageSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
  room_id: z.string().uuid(),
  inspection_type: inspectionTypeSchema,
  image_url: z.string(),
  image_hash: z.string(),
  captured_at: z.string(),
  gps_lat: z.number().nullable(),
  gps_lng: z.number().nullable(),
  device_id: z.string(),
  note: z.string().nullable(),
  image_index: z.number().int(),
  uploaded_by: z.string().uuid(),
});

export const uploadInspectionImagesBodySchema = z.object({
  room_id: z.string().uuid(),
  captured_at: z.array(z.string()).min(1).max(10),
  gps_lat: z.array(z.number()).min(1).max(10),
  gps_lng: z.array(z.number()).min(1).max(10),
  device_id: z.array(z.string()).min(1).max(10),
  notes: z.array(z.string()).max(10).optional(),
});

export const inspectionImagesResponseSchema = z.object({
  images: z.array(inspectionImageSchema),
});

export type InspectionImage = z.infer<typeof inspectionImageSchema>;
export type UploadInspectionImagesBody = z.infer<typeof uploadInspectionImagesBodySchema>;
export type InspectionImagesResponse = z.infer<typeof inspectionImagesResponseSchema>;
