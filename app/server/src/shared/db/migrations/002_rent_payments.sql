-- RentSmart — Migration 002: Monthly rent payments
-- Adds on-chain rent payment tracking and RENT_PAID audit event type.

-- Extend audit event enum
ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'RENT_PAID';

-- Monthly rent payments recorded after tenant signs and broadcasts the pay_rent tx
CREATE TABLE rent_payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id             UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL REFERENCES users(id),
    rent_amount_eur         DECIMAL(10, 2) NOT NULL,
    rent_lamports           BIGINT NOT NULL,
    landlord_amount_lamports BIGINT NOT NULL,  -- rent_lamports * 0.995
    platform_fee_lamports   BIGINT NOT NULL,   -- rent_lamports * 0.01 (1% total)
    tx_signature            VARCHAR(88) NOT NULL UNIQUE,
    period_month            SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year             SMALLINT NOT NULL CHECK (period_year >= 2024),
    paid_at                 TIMESTAMPTZ DEFAULT NOW(),
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rent_payments_contract ON rent_payments(contract_id);
CREATE INDEX idx_rent_payments_tenant   ON rent_payments(tenant_id);
CREATE INDEX idx_rent_payments_period   ON rent_payments(contract_id, period_year, period_month);
