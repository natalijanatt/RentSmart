import { z } from 'zod';

export { createContractBodySchema } from '@rentsmart/contracts';

export const cancelContractBodySchema = z.object({
  reason: z.string().max(500).optional(),
});
