-- Remove pending_acceptance from contract_status enum.
-- PostgreSQL does not support DROP VALUE on enums, so we recreate the type.

CREATE TYPE contract_status_new AS ENUM (
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
  'cancelled'
);

ALTER TABLE contracts ALTER COLUMN status DROP DEFAULT;

ALTER TABLE contracts
  ALTER COLUMN status TYPE contract_status_new
  USING status::text::contract_status_new;

DROP TYPE contract_status;
ALTER TYPE contract_status_new RENAME TO contract_status;

ALTER TABLE contracts ALTER COLUMN status SET DEFAULT 'draft'::contract_status;
