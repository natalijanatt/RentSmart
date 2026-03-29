import { z } from 'zod';

import { settlementTypeSchema, severitySchema } from './shared';

export const findingSchema = z.object({
  item: z.string(),
  description: z.string(),
  severity: severitySchema,
  confidence: z.number(),
  wear_and_tear: z.boolean(),
  location_in_image: z.string(),
});

export const analysisResultSchema = z.object({
  room_id: z.string().uuid(),
  room: z.string(),
  findings: z.array(findingSchema),
  summary: z.string(),
  overall_condition: z.enum(['excellent', 'good', 'fair', 'damaged', 'unknown']),
});

export const deductionSchema = z.object({
  finding: z.string(),
  description: z.string(),
  severity: severitySchema,
  confidence: z.number(),
  deduction_eur: z.number(),
  deduction_percent: z.number(),
  reason: z.string(),
});

export const skippedFindingSchema = z.object({
  finding: z.string(),
  description: z.string(),
  reason: z.string(),
});

export const settlementSchema = z.object({
  id: z.string().uuid(),
  contract_id: z.string().uuid(),
  deposit_amount_eur: z.number(),
  total_deduction_eur: z.number(),
  total_deduction_percent: z.number(),
  tenant_receives_eur: z.number(),
  landlord_receives_eur: z.number(),
  deductions: z.array(deductionSchema),
  skipped_findings: z.array(skippedFindingSchema),
  settlement_type: settlementTypeSchema,
  requires_manual_review: z.boolean(),
  explanation: z.string(),
  landlord_approved_at: z.string().nullable(),
  landlord_approved_by: z.string().uuid().nullable(),
  tenant_approved_at: z.string().nullable(),
  tenant_approved_by: z.string().uuid().nullable(),
  finalized_at: z.string().nullable(),
});

export const analysisResultsResponseSchema = z.object({
  analysis: z.array(analysisResultSchema),
});

export const settlementResponseSchema = z.object({
  settlement: settlementSchema,
});

export const approveSettlementResponseSchema = z.object({
  settlement: settlementSchema,
  contract_status: z.string(),
  approved_by_role: z.enum(['landlord', 'tenant']),
  is_fully_approved: z.boolean(),
});

export type Finding = z.infer<typeof findingSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type Deduction = z.infer<typeof deductionSchema>;
export type SkippedFinding = z.infer<typeof skippedFindingSchema>;
export type Settlement = z.infer<typeof settlementSchema>;
export type AnalysisResultsResponse = z.infer<typeof analysisResultsResponseSchema>;
export type SettlementResponse = z.infer<typeof settlementResponseSchema>;
export type ApproveSettlementResponse = z.infer<typeof approveSettlementResponseSchema>;
