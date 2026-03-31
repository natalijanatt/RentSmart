import { z } from 'zod';

export const contractStatusSchema = z.enum([
  'draft',
  'accepted',
  'checkin_in_progress',
  'checkin_pending_approval',
  'checkin_rejected',
  'active',
  'checkout_in_progress',
  'checkout_pending_approval',
  'checkout_rejected',
  'pending_analysis',
  'settlement',
  'completed',
  'cancelled',
]);

export const roomTypeSchema = z.enum([
  'kuhinja',
  'kupatilo',
  'dnevna_soba',
  'spavaca_soba',
  'hodnik',
  'balkon',
  'ostava',
  'terasa',
  'garaza',
  'druga',
]);

export const severitySchema = z.enum(['none', 'minor', 'medium', 'major']);
export const inspectionTypeSchema = z.enum(['checkin', 'checkout']);
export const settlementTypeSchema = z.enum(['automatic', 'manual_review']);
export const actorRoleSchema = z.enum(['landlord', 'tenant', 'system', 'both']);

export type ContractStatus = z.infer<typeof contractStatusSchema>;
export type RoomType = z.infer<typeof roomTypeSchema>;
export type Severity = z.infer<typeof severitySchema>;
export type InspectionType = z.infer<typeof inspectionTypeSchema>;
export type SettlementType = z.infer<typeof settlementTypeSchema>;
export type ActorRole = z.infer<typeof actorRoleSchema>;
