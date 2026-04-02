-- Reconcile contract status enum with runtime flow.
-- Some environments applied migration 003 (which removed pending_acceptance)
-- while services/state machine still depend on pending_acceptance.

ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'pending_acceptance';

-- Contracts in draft without a tenant should continue through the invite flow.
UPDATE contracts
SET status = 'pending_acceptance'
WHERE status::text = 'draft' AND tenant_id IS NULL;

ALTER TABLE contracts
  ALTER COLUMN status SET DEFAULT 'pending_acceptance'::contract_status;
