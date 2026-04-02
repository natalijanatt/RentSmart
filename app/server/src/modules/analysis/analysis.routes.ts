import { Router } from 'express';

import { requireAuth } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/middleware/errorHandler.js';
import {
  approveSettlement,
  getAnalysisResults,
  getSettlement,
  runAnalysis,
} from './analysis.service.js';

export const analysisRouter = Router();

// POST /api/v1/contracts/:id/analyze  (internal/system trigger)
analysisRouter.post(
  '/:id/analyze',
  requireAuth,
  asyncHandler(async (req, res) => {
    const settlement = await runAnalysis(req.params.id as string);
    res.json({ settlement });
  }),
);

// GET /api/v1/contracts/:id/analysis
analysisRouter.get(
  '/:id/analysis',
  requireAuth,
  asyncHandler(async (req, res) => {
    const analysis = await getAnalysisResults(req.params.id as string, req.user!.id);
    res.json({ analysis });
  }),
);

// GET /api/v1/contracts/:id/settlement
analysisRouter.get(
  '/:id/settlement',
  requireAuth,
  asyncHandler(async (req, res) => {
    const settlement = await getSettlement(req.params.id as string, req.user!.id);
    res.json({ settlement });
  }),
);

// POST /api/v1/contracts/:id/settlement/approve
analysisRouter.post(
  '/:id/settlement/approve',
  requireAuth,
  asyncHandler(async (req, res) => {
    const settlement = await approveSettlement(req.params.id as string, req.user!.id);
    res.json({ settlement });
  }),
);
