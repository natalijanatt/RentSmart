-- RentSmart — Migration 002: Rent escrow tracking
-- Tracks tenant top-ups into the rent escrow PDA and monthly releases to the landlord.

-- Extend audit event enum
ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'RENT_TOPPED_UP';
ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'RENT_RELEASED';

-- Tenant-initiated top-ups: tenant pre-funds the on-chain escrow PDA.
-- Recorded after the tenant signs and broadcasts the top_up_rent transaction.
CREATE TABLE rent_top_ups (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id             UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL REFERENCES users(id),
    rent_amount_eur         DECIMAL(10, 2) NOT NULL,   -- face-value rent at time of top-up
    amount_lamports         BIGINT NOT NULL,            -- total SOL deposited (rent × 1.005 × months)
    months_covered          SMALLINT NOT NULL CHECK (months_covered >= 1),
    fee_lamports            BIGINT NOT NULL,            -- tenant's 0.5% share included in deposit
    tx_signature            VARCHAR(88) NOT NULL UNIQUE,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rent_top_ups_contract ON rent_top_ups(contract_id);
CREATE INDEX idx_rent_top_ups_tenant   ON rent_top_ups(tenant_id);

-- Server-initiated monthly releases: authority releases one month of rent from escrow.
-- Recorded after the server's cron job broadcasts the release_monthly_rent transaction.
CREATE TABLE rent_releases (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id              UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    rent_amount_eur          DECIMAL(10, 2) NOT NULL,
    rent_lamports            BIGINT NOT NULL,            -- face-value rent in lamports
    landlord_amount_lamports BIGINT NOT NULL,            -- rent_lamports * 0.995
    platform_fee_lamports    BIGINT NOT NULL,            -- rent_lamports * 0.01 (1% total)
    tx_signature             VARCHAR(88) NOT NULL UNIQUE,
    period_month             SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year              SMALLINT NOT NULL CHECK (period_year >= 2024),
    released_at              TIMESTAMPTZ DEFAULT NOW(),
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rent_releases_contract ON rent_releases(contract_id);
CREATE INDEX idx_rent_releases_period   ON rent_releases(contract_id, period_year, period_month);
-- Prevent double-release for the same billing period
CREATE UNIQUE INDEX idx_rent_releases_period_unique ON rent_releases(contract_id, period_year, period_month);
