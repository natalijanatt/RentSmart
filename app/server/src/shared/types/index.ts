/**
 * Server-local DB row types.
 * These mirror the DB schema exactly — timestamps are Date objects, not strings.
 * Use the API types from @rentsmart/contracts for request/response shapes.
 */

export interface DbUser {
  id: string;
  phone: string;
  display_name: string;
  firebase_uid: string;
  device_id: string | null;
  solana_pubkey: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbContract {
  id: string;
  landlord_id: string;
  tenant_id: string | null;
  invite_code: string;
  property_address: string;
  property_gps_lat: string | null;
  property_gps_lng: string | null;
  rent_monthly_eur: string;
  deposit_amount_eur: string;
  start_date: Date;
  end_date: Date;
  deposit_rules: string | null;
  notes: string | null;
  plain_language_summary: string | null;
  status: string;
  deposit_status: string;
  contract_hash: string | null;
  rejection_comment: string | null;
  solana_pda: string | null;
  solana_tx_init: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbRoom {
  id: string;
  contract_id: string;
  room_type: string;
  custom_name: string | null;
  is_mandatory: boolean;
  display_order: number;
  created_at: Date;
}

export interface DbInspectionImage {
  id: string;
  contract_id: string;
  room_id: string;
  inspection_type: string;
  image_url: string;
  image_hash: string;
  captured_at: Date;
  gps_lat: string | null;
  gps_lng: string | null;
  device_id: string;
  note: string | null;
  image_index: number;
  uploaded_by: string;
  created_at: Date;
}

export interface DbSettlement {
  id: string;
  contract_id: string;
  deposit_amount_eur: string;
  total_deduction_eur: string;
  total_deduction_percent: string;
  tenant_receives_eur: string;
  landlord_receives_eur: string;
  deductions: unknown;
  skipped_findings: unknown;
  settlement_type: string;
  requires_manual_review: boolean;
  explanation: string | null;
  landlord_approved_at: Date | null;
  landlord_approved_by: string | null;
  tenant_approved_at: Date | null;
  tenant_approved_by: string | null;
  finalized_at: Date | null;
  created_at: Date;
}

export interface DbAuditEvent {
  id: string;
  contract_id: string;
  event_type: string;
  actor_id: string | null;
  actor_role: string | null;
  data: unknown;
  event_hash: string;
  previous_hash: string | null;
  created_at: Date;
}

export interface DbRentTopUp {
  id: string;
  contract_id: string;
  tenant_id: string;
  rent_amount_eur: string;
  amount_lamports: string;
  months_covered: number;
  fee_lamports: string;
  tx_signature: string;
  created_at: Date;
}

export interface DbRentRelease {
  id: string;
  contract_id: string;
  rent_amount_eur: string;
  rent_lamports: string;
  landlord_amount_lamports: string;
  platform_fee_lamports: string;
  tx_signature: string;
  period_month: number;
  period_year: number;
  released_at: Date;
  created_at: Date;
}

export interface DbAnalysisResult {
  id: string;
  contract_id: string;
  room_id: string;
  raw_llm_response: unknown;
  findings: unknown;
  summary: string | null;
  overall_condition: string | null;
  analyzed_at: Date;
  llm_model: string | null;
  llm_tokens_used: number | null;
  llm_cost_usd: string | null;
}
