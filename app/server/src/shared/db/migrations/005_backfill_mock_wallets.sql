-- Backfill Solana wallets for mock users used by mobile dev login.
-- This avoids contract creation failures for existing seeded users that have null wallets.

UPDATE users
SET solana_pubkey = '8A6W4J7pM3xk2zN9Qf1hR4tY5uL8cV2bD7eF3gH1jK9'
WHERE firebase_uid = 'mock_landlord_marko';

UPDATE users
SET solana_pubkey = 'GPBu1DDgpb2pxovzVFnHRcZGfcer6rCnU4NUQck2yVrV'
WHERE firebase_uid = 'mock_tenant_ana';
