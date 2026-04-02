import { Router } from 'express';

import { requireAuth } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/middleware/errorHandler.js';
import { getContractBlockchainState } from './blockchain.service.js';

export const blockchainRouter = Router();

blockchainRouter.use(requireAuth);

blockchainRouter.get(
  '/:id/blockchain',
  asyncHandler(async (req, res) => {
    const state = await getContractBlockchainState(req.params.id as string, req.user!.id);
    res.json(state);
  }),
);
