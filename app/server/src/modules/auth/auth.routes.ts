import { Router } from 'express';
import { verifyAuthBodySchema } from '@rentsmart/contracts';
import { validate } from '../../shared/middleware/validate.js';
import { requireAuth } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/middleware/errorHandler.js';
import { verifyAndUpsert, getMe } from './auth.service.js';

export const authRouter = Router();

// POST /api/v1/auth/verify
authRouter.post(
  '/verify',
  validate(verifyAuthBodySchema),
  asyncHandler(async (req, res) => {
    const { firebase_token, display_name, device_id } = req.body;
    const user = await verifyAndUpsert(firebase_token, display_name, device_id);
    res.json({ user, auth_source: 'firebase' });
  }),
);

// GET /api/v1/auth/me
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getMe(req.user!.id);
    res.json({ user });
  }),
);
