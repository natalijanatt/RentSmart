import { z } from 'zod';

export { createContractBodySchema } from '@rentsmart/contracts';

export const acceptContractBodySchema = z.object({
  invite_code: z.string().min(1),
});

export const cancelContractBodySchema = z.object({
  reason: z.string().max(500).optional(),
});
