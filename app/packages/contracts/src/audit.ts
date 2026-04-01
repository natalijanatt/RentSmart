import { z } from 'zod';

import { actorRoleSchema } from './shared';

export const auditEventTypeSchema = z.enum([
  'CONTRACT_CREATED',
  'INVITE_SENT',
  'CONTRACT_ACCEPTED',
  'DEPOSIT_LOCKED',
  'CHECKIN_STARTED',
  'CHECKIN_IMAGE_CAPTURED',
  'CHECKIN_COMPLETED',
  'CHECKIN_APPROVED',
  'CHECKIN_REJECTED',
  'CHECKOUT_STARTED',
  'CHECKOUT_IMAGE_CAPTURED',
  'CHECKOUT_COMPLETED',
  'CHECKOUT_APPROVED',
  'CHECKOUT_REJECTED',
  'LLM_ANALYSIS_STARTED',
  'LLM_ANALYSIS_COMPLETED',
  'RULE_ENGINE_EXECUTED',
  'SETTLEMENT_PROPOSED',
  'SETTLEMENT_VIEWED',
  'SETTLEMENT_APPROVED',
  'SETTLEMENT_FINALIZED',
  'DEPOSIT_RELEASED',
  'CONTRACT_HASH_STORED',
  'CONTRACT_CANCELLED',
  'RENT_TOPPED_UP',
  'RENT_RELEASED',
]);

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
  event_type: auditEventTypeSchema,
  actor_id: z.string().uuid().nullable(),
  actor_role: actorRoleSchema.nullable(),
  data: z.record(z.string(), z.unknown()),
  event_hash: z.string(),
  previous_hash: z.string().nullable(),
  created_at: z.string(),
});

export const auditTrailResponseSchema = z.object({
  events: z.array(auditEventSchema),
  chain_valid: z.boolean(),
});

export type AuditEventType = z.infer<typeof auditEventTypeSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditTrailResponse = z.infer<typeof auditTrailResponseSchema>;
