import { Router } from 'express';

import { requireAuth } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/middleware/errorHandler.js';
import { validate } from '../../shared/middleware/validate.js';
import {
  acceptContract,
  cancelContract,
  createContract,
  getContract,
  getContractByInviteCode,
  listContracts,
} from './contracts.service.js';
import { acceptContractBodySchema, cancelContractBodySchema, createContractBodySchema } from './contracts.schema.js';
import {
  buildRentPaymentTx,
  confirmRentPaymentBodySchema,
  confirmRentPayment,
  listRentPayments,
} from './rent.service.js';

export const contractsRouter = Router();

// Public — must be registered before requireAuth middleware
contractsRouter.get(
  '/invite/:code',
  asyncHandler(async (req, res) => {
    const contract = await getContractByInviteCode(req.params.code as string);
    res.json({ contract });
  }),
);

contractsRouter.use(requireAuth);

contractsRouter.post(
  '/',
  validate(createContractBodySchema),
  asyncHandler(async (req, res) => {
    const contract = await createContract(req.user!.id, req.body);
    res.status(201).json({ contract });
  }),
);

contractsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const contracts = await listContracts(req.user!.id);
    res.json({ contracts });
  }),
);

contractsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const contract = await getContract(req.params.id as string, req.user!.id);
    res.json({ contract });
  }),
);

contractsRouter.post(
  '/:id/accept',
  validate(acceptContractBodySchema),
  asyncHandler(async (req, res) => {
    const result = await acceptContract(req.params.id as string, req.user!.id, req.body.invite_code);
    res.json({ contract: result.contract, solana_lock_deposit_tx: result.solana_lock_deposit_tx });
  }),
);

contractsRouter.post(
  '/:id/cancel',
  validate(cancelContractBodySchema),
  asyncHandler(async (req, res) => {
    const contract = await cancelContract(req.params.id as string, req.user!.id, req.body.reason);
    res.json({ contract });
  }),
);

// ── Monthly rent payment ──────────────────────────────────────────────────────

contractsRouter.post(
  '/:id/rent/pay',
  asyncHandler(async (req, res) => {
    const result = await buildRentPaymentTx(req.params.id as string, req.user!.id);
    res.json(result);
  }),
);

contractsRouter.post(
  '/:id/rent/confirm',
  validate(confirmRentPaymentBodySchema),
  asyncHandler(async (req, res) => {
    const payment = await confirmRentPayment(req.params.id as string, req.user!.id, req.body);
    res.status(201).json({ payment });
  }),
);

contractsRouter.get(
  '/:id/rent',
  asyncHandler(async (req, res) => {
    const payments = await listRentPayments(req.params.id as string, req.user!.id);
    res.json({ payments });
  }),
);
