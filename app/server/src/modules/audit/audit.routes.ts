import { Router } from 'express';

import { requireAuth } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/middleware/errorHandler.js';
import { getAuditTrail } from './audit.service.js';

export const auditRouter = Router();

auditRouter.get(
  '/:id/audit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trail = await getAuditTrail(req.params.id as string, req.user!.id);
    res.json(trail);
  }),
);
