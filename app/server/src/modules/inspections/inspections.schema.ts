import { z } from 'zod';

export { uploadInspectionImagesBodySchema } from '@rentsmart/contracts';

export const rejectInspectionSchema = z.object({
  comment: z.string().min(1, 'Rejection comment is required').max(1000),
});

export type RejectInspectionInput = z.infer<typeof rejectInspectionSchema>;
