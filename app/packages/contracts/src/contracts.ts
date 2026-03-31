import { z } from 'zod';

import { contractStatusSchema, roomTypeSchema } from './shared';

export const roomSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
  room_type: roomTypeSchema,
  custom_name: z.string().nullable(),
  is_mandatory: z.boolean(),
  display_order: z.number().int(),
});

export const contractSchema = z.object({
  id: z.string().uuid(),
  landlord_id: z.string().uuid(),
  tenant_id: z.string().uuid().nullable(),
  invite_code: z.string(),
  property_address: z.string(),
  property_gps_lat: z.number().nullable(),
  property_gps_lng: z.number().nullable(),
  rent_monthly_eur: z.number(),
  deposit_amount_eur: z.number(),
  start_date: z.string(),
  end_date: z.string(),
  deposit_rules: z.string().nullable(),
  notes: z.string().nullable(),
  plain_language_summary: z.string().nullable(),
  status: contractStatusSchema,
  deposit_status: z.string(),
  contract_hash: z.string().nullable(),
  rejection_comment: z.string().nullable(),
  solana_pda: z.string().nullable().optional(),
  solana_tx_init: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  rooms: z.array(roomSchema).optional(),
});

export const createContractRoomInputSchema = z.object({
  room_type: roomTypeSchema,
  custom_name: z.string().max(100).optional(),
  is_mandatory: z.boolean(),
});

export const createContractBodySchema = z.object({
  property_address: z.string().min(1).max(500),
  property_gps: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
  rent_monthly_eur: z.number().positive(),
  deposit_amount_eur: z.number().positive(),
  start_date: z.string(),
  end_date: z.string(),
  deposit_rules: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  rooms: z.array(createContractRoomInputSchema).min(1).max(15),
}).refine((data) => new Date(data.end_date) > new Date(data.start_date), {
  message: 'end_date must be after start_date',
  path: ['end_date'],
});

export const contractResponseSchema = z.object({
  contract: contractSchema,
});

export const contractsResponseSchema = z.object({
  contracts: z.array(contractSchema),
});

export type Room = z.infer<typeof roomSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type CreateContractRoomInput = z.infer<typeof createContractRoomInputSchema>;
export type CreateContractBody = z.infer<typeof createContractBodySchema>;
export type ContractResponse = z.infer<typeof contractResponseSchema>;
export type ContractsResponse = z.infer<typeof contractsResponseSchema>;
