-- RentSmart Backend — Initial Migration
-- File: src/shared/db/migrations/001_initial.sql

-- ENUMs
CREATE TYPE contract_status AS ENUM (
  'draft',
  'pending_acceptance',
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
  'cancelled'
);

CREATE TYPE deposit_status AS ENUM (
  'pending',
  'locked',
  'partially_released',
  'fully_released',
  'claimed'
);

CREATE TYPE room_type AS ENUM (
  'kuhinja',
  'kupatilo',
  'dnevna_soba',
  'spavaca_soba',
  'hodnik',
  'balkon',
  'ostava',
  'terasa',
  'garaza',
  'druga'
);

CREATE TYPE inspection_type AS ENUM ('checkin', 'checkout');
CREATE TYPE settlement_type AS ENUM ('automatic', 'manual_review');

CREATE TYPE audit_event_type AS ENUM (
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
  'SETTLEMENT_FINALIZED',
  'DEPOSIT_RELEASED',
  'CONTRACT_HASH_STORED',
  'CONTRACT_CANCELLED'
);

-- TABLES

CREATE TABLE users (
       id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       phone         VARCHAR(20) UNIQUE NOT NULL,
       display_name  VARCHAR(100) NOT NULL,
       firebase_uid  VARCHAR(128) UNIQUE NOT NULL,
       device_id     VARCHAR(255),
       solana_pubkey VARCHAR(44),
       created_at    TIMESTAMPTZ DEFAULT NOW(),
       updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);

CREATE TABLE contracts (
       id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       landlord_id           UUID NOT NULL REFERENCES users(id),
       tenant_id             UUID REFERENCES users(id),
       invite_code           VARCHAR(12) UNIQUE NOT NULL,
       property_address      TEXT NOT NULL,
       property_gps_lat      DECIMAL(10, 7),
       property_gps_lng      DECIMAL(10, 7),
       rent_monthly_eur      DECIMAL(10, 2) NOT NULL,
       deposit_amount_eur    DECIMAL(10, 2) NOT NULL,
       start_date            DATE NOT NULL,
       end_date              DATE NOT NULL,
       deposit_rules         TEXT,
       notes                 TEXT,
       plain_language_summary TEXT,
       status                contract_status DEFAULT 'draft',
       deposit_status        deposit_status DEFAULT 'pending',
       contract_hash         VARCHAR(64),
       rejection_comment     TEXT,
       solana_pda            VARCHAR(44),
       solana_tx_init        VARCHAR(88),
       created_at            TIMESTAMPTZ DEFAULT NOW(),
       updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contracts_landlord ON contracts(landlord_id);
CREATE INDEX idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX idx_contracts_invite ON contracts(invite_code);
CREATE INDEX idx_contracts_status ON contracts(status);

CREATE TABLE rooms (
       id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       contract_id   UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
       room_type     room_type NOT NULL,
       custom_name   VARCHAR(100),
       is_mandatory  BOOLEAN DEFAULT TRUE,
       display_order SMALLINT DEFAULT 0,
       created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rooms_contract ON rooms(contract_id);

CREATE TABLE inspection_images (
       id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       contract_id       UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
       room_id           UUID NOT NULL REFERENCES rooms(id),
       inspection_type   inspection_type NOT NULL,
       image_url         TEXT NOT NULL,
       image_hash        VARCHAR(64) NOT NULL,
       captured_at       TIMESTAMPTZ NOT NULL,
       gps_lat           DECIMAL(10, 7),
       gps_lng           DECIMAL(10, 7),
       device_id         VARCHAR(255) NOT NULL,
       note              TEXT,
       image_index       SMALLINT NOT NULL,
       uploaded_by       UUID NOT NULL REFERENCES users(id),
       created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_images_contract ON inspection_images(contract_id);
CREATE INDEX idx_images_room ON inspection_images(room_id);
CREATE INDEX idx_images_type ON inspection_images(inspection_type);

CREATE TABLE analysis_results (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contract_id     UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      room_id         UUID NOT NULL REFERENCES rooms(id),
      raw_llm_response JSONB NOT NULL,
      findings        JSONB NOT NULL DEFAULT '[]',
      summary         TEXT,
      overall_condition VARCHAR(20),
      analyzed_at     TIMESTAMPTZ DEFAULT NOW(),
      llm_model       VARCHAR(50),
      llm_tokens_used INTEGER,
      llm_cost_usd    DECIMAL(8, 4)
);

CREATE INDEX idx_analysis_contract ON analysis_results(contract_id);

CREATE TABLE settlements (
     id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     contract_id             UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
     deposit_amount_eur      DECIMAL(10, 2) NOT NULL,
     total_deduction_eur     DECIMAL(10, 2) NOT NULL DEFAULT 0,
     total_deduction_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
     tenant_receives_eur     DECIMAL(10, 2) NOT NULL,
     landlord_receives_eur   DECIMAL(10, 2) NOT NULL,
     deductions              JSONB NOT NULL DEFAULT '[]',
     skipped_findings        JSONB NOT NULL DEFAULT '[]',
     settlement_type         settlement_type NOT NULL,
     requires_manual_review  BOOLEAN DEFAULT FALSE,
     explanation             TEXT,
     landlord_approved_at    TIMESTAMPTZ,
     landlord_approved_by    UUID REFERENCES users(id),
     tenant_approved_at      TIMESTAMPTZ,
     tenant_approved_by      UUID REFERENCES users(id),
     finalized_at            TIMESTAMPTZ,
     created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_settlements_contract ON settlements(contract_id);

CREATE TABLE audit_events (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contract_id   UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      event_type    audit_event_type NOT NULL,
      actor_id      UUID REFERENCES users(id),
      actor_role    VARCHAR(20),
      data          JSONB DEFAULT '{}',
      event_hash    VARCHAR(64) NOT NULL,
      previous_hash VARCHAR(64),
      created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_contract ON audit_events(contract_id);
CREATE INDEX idx_audit_type ON audit_events(event_type);
CREATE INDEX idx_audit_created ON audit_events(created_at);
