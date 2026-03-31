-- RentSmart Backend - Seed Test Data
-- File: src/shared/db/migrations/002_seed_test_data.sql

-- Test users provided by the client. Safe to keep here so a fresh database
-- has the expected landlord/tenant identities before related seed rows load.
INSERT INTO users (phone, display_name, firebase_uid, device_id)
VALUES
  ('+381641234567', 'Marko Petrovic', 'mock_landlord_marko', 'mock-device-landlord'),
  ('+381697654321', 'Ana Nikolic',    'mock_tenant_ana',     'mock-device-tenant')
ON CONFLICT (firebase_uid) DO NOTHING;

-- One realistic end-to-end contract used by the rest of the seeded records.
INSERT INTO contracts (
  landlord_id,
  tenant_id,
  invite_code,
  property_address,
  property_gps_lat,
  property_gps_lng,
  rent_monthly_eur,
  deposit_amount_eur,
  start_date,
  end_date,
  deposit_rules,
  notes,
  plain_language_summary,
  status,
  deposit_status,
  contract_hash,
  solana_pda,
  solana_tx_init
)
SELECT
  landlord.id,
  tenant.id,
  'RSMART001',
  'Bulevar kralja Aleksandra 73, Beograd',
  44.8055411,
  20.4701024,
  650.00,
  1300.00,
  DATE '2026-04-01',
  DATE '2027-03-31',
  'Depozit pokriva stetu van redovnog habanja, neplacene racune i troskove dubinskog ciscenja ako stan nije vracen u urednom stanju.',
  'Test ugovor za razvojno okruzenje i proveru kompletnog toka check-in/check-out procesa.',
  'Marko izdaje dvosoban stan Ani na godinu dana uz depozit u visini dve mesecne kirije.',
  'settlement',
  'partially_released',
  'c3d8d8f4b0e4e9a8bb3a7f7a6fd5d2d42f3648c2cc5a52a4f0a7c2c2d9ef1001',
  'SeedPdaMarkoAnaContract00000000000000000001',
  'SeedInitTxMarkoAnaContract000000000000000000000000000000000000000000000000000001'
FROM users landlord
CROSS JOIN users tenant
WHERE landlord.firebase_uid = 'mock_landlord_marko'
  AND tenant.firebase_uid = 'mock_tenant_ana'
  AND NOT EXISTS (
    SELECT 1
    FROM contracts c
    WHERE c.invite_code = 'RSMART001'
  );

-- Mandatory and optional rooms for the seeded contract.
WITH seeded_contract AS (
  SELECT id
  FROM contracts
  WHERE invite_code = 'RSMART001'
)
INSERT INTO rooms (contract_id, room_type, custom_name, is_mandatory, display_order)
SELECT seeded_contract.id, v.room_type::room_type, v.custom_name, v.is_mandatory, v.display_order
FROM seeded_contract
CROSS JOIN (
  VALUES
    ('dnevna_soba', NULL, TRUE, 1),
    ('spavaca_soba', 'Spavaca soba', TRUE, 2),
    ('kuhinja', NULL, TRUE, 3),
    ('kupatilo', NULL, TRUE, 4),
    ('terasa', NULL, FALSE, 5)
) AS v(room_type, custom_name, is_mandatory, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM rooms r
  WHERE r.contract_id = seeded_contract.id
);

-- Check-in and check-out images per room.
INSERT INTO inspection_images (
  contract_id,
  room_id,
  inspection_type,
  image_url,
  image_hash,
  captured_at,
  gps_lat,
  gps_lng,
  device_id,
  note,
  image_index,
  uploaded_by
)
SELECT
  seeded_context.contract_id,
  room.id,
  v.inspection_type::inspection_type,
  v.image_url,
  v.image_hash,
  v.captured_at,
  44.8055411,
  20.4701024,
  v.device_id,
  v.note,
  v.image_index,
  v.uploaded_by
FROM (
  SELECT
    c.id AS contract_id,
    landlord.id AS landlord_id,
    tenant.id AS tenant_id
  FROM contracts c
  JOIN users landlord ON landlord.id = c.landlord_id
  JOIN users tenant ON tenant.id = c.tenant_id
  WHERE c.invite_code = 'RSMART001'
) AS seeded_context
JOIN rooms room ON room.contract_id = seeded_context.contract_id
JOIN LATERAL (
  VALUES
    (
      'checkin',
      CASE room.room_type
        WHEN 'dnevna_soba' THEN 'https://cdn.rentsmart.test/checkin/dnevna-1.jpg'
        WHEN 'spavaca_soba' THEN 'https://cdn.rentsmart.test/checkin/spavaca-1.jpg'
        WHEN 'kuhinja' THEN 'https://cdn.rentsmart.test/checkin/kuhinja-1.jpg'
        WHEN 'kupatilo' THEN 'https://cdn.rentsmart.test/checkin/kupatilo-1.jpg'
        ELSE 'https://cdn.rentsmart.test/checkin/terasa-1.jpg'
      END,
      CASE room.room_type
        WHEN 'dnevna_soba' THEN '1111111111111111111111111111111111111111111111111111111111111111'
        WHEN 'spavaca_soba' THEN '2222222222222222222222222222222222222222222222222222222222222222'
        WHEN 'kuhinja' THEN '3333333333333333333333333333333333333333333333333333333333333333'
        WHEN 'kupatilo' THEN '4444444444444444444444444444444444444444444444444444444444444444'
        ELSE '5555555555555555555555555555555555555555555555555555555555555555'
      END,
      TIMESTAMPTZ '2026-04-01 10:00:00+02',
      'mock-device-tenant',
      'Pocetno stanje prostorije pri useljenju.',
      1,
      seeded_context.tenant_id
    ),
    (
      'checkout',
      CASE room.room_type
        WHEN 'dnevna_soba' THEN 'https://cdn.rentsmart.test/checkout/dnevna-1.jpg'
        WHEN 'spavaca_soba' THEN 'https://cdn.rentsmart.test/checkout/spavaca-1.jpg'
        WHEN 'kuhinja' THEN 'https://cdn.rentsmart.test/checkout/kuhinja-1.jpg'
        WHEN 'kupatilo' THEN 'https://cdn.rentsmart.test/checkout/kupatilo-1.jpg'
        ELSE 'https://cdn.rentsmart.test/checkout/terasa-1.jpg'
      END,
      CASE room.room_type
        WHEN 'dnevna_soba' THEN 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        WHEN 'spavaca_soba' THEN 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        WHEN 'kuhinja' THEN 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
        WHEN 'kupatilo' THEN 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
        ELSE 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      END,
      TIMESTAMPTZ '2027-03-31 18:30:00+02',
      'mock-device-landlord',
      CASE room.room_type
        WHEN 'kuhinja' THEN 'Uocena fleka i blago ostecenje fronte ispod sudopere.'
        WHEN 'kupatilo' THEN 'Vidljiv kamenac oko tus kabine.'
        ELSE 'Zavrsno stanje bez posebnih napomena.'
      END,
      2,
      seeded_context.landlord_id
    )
) AS v(
  inspection_type,
  image_url,
  image_hash,
  captured_at,
  device_id,
  note,
  image_index,
  uploaded_by
) ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM inspection_images ii
  WHERE ii.contract_id = seeded_context.contract_id
);

-- LLM/rule-analysis results for each room.
WITH seeded_contract AS (
  SELECT id
  FROM contracts
  WHERE invite_code = 'RSMART001'
)
INSERT INTO analysis_results (
  contract_id,
  room_id,
  raw_llm_response,
  findings,
  summary,
  overall_condition,
  analyzed_at,
  llm_model,
  llm_tokens_used,
  llm_cost_usd
)
SELECT
  seeded_contract.id,
  room.id,
  jsonb_build_object(
    'roomType', room.room_type,
    'decision', CASE room.room_type
      WHEN 'kuhinja' THEN 'minor_damage_detected'
      WHEN 'kupatilo' THEN 'cleaning_required'
      ELSE 'no_material_change'
    END,
    'confidence', CASE room.room_type
      WHEN 'kuhinja' THEN 0.92
      WHEN 'kupatilo' THEN 0.88
      ELSE 0.97
    END
  ),
  CASE room.room_type
    WHEN 'kuhinja' THEN jsonb_build_array(
      jsonb_build_object(
        'type', 'surface_damage',
        'severity', 'minor',
        'estimated_cost_eur', 85,
        'description', 'Ostecena fronta elementa ispod sudopere.'
      )
    )
    WHEN 'kupatilo' THEN jsonb_build_array(
      jsonb_build_object(
        'type', 'cleaning',
        'severity', 'low',
        'estimated_cost_eur', 25,
        'description', 'Potrebno uklanjanje kamenca i detaljno ciscenje tus kabine.'
      )
    )
    ELSE '[]'::jsonb
  END,
  CASE room.room_type
    WHEN 'kuhinja' THEN 'Uoceno manje ostecenje kuhinjskog elementa koje prevazilazi redovno habanje.'
    WHEN 'kupatilo' THEN 'Prostorija je funkcionalna, ali zahteva dodatno ciscenje.'
    ELSE 'Nema znacajnih odstupanja izmedju check-in i check-out stanja.'
  END,
  CASE room.room_type
    WHEN 'kuhinja' THEN 'good'
    WHEN 'kupatilo' THEN 'good'
    ELSE 'excellent'
  END,
  TIMESTAMPTZ '2027-03-31 20:15:00+02',
  'mock-gpt-analysis-v1',
  1450,
  0.0345
FROM seeded_contract
JOIN rooms room ON room.contract_id = seeded_contract.id
WHERE NOT EXISTS (
  SELECT 1
  FROM analysis_results ar
  WHERE ar.contract_id = seeded_contract.id
);

-- Settlement generated from analysis.
WITH seeded_contract AS (
  SELECT
    c.id,
    c.deposit_amount_eur,
    c.landlord_id,
    c.tenant_id
  FROM contracts c
  WHERE c.invite_code = 'RSMART001'
)
INSERT INTO settlements (
  contract_id,
  deposit_amount_eur,
  total_deduction_eur,
  total_deduction_percent,
  tenant_receives_eur,
  landlord_receives_eur,
  deductions,
  skipped_findings,
  settlement_type,
  requires_manual_review,
  explanation,
  landlord_approved_at,
  landlord_approved_by,
  tenant_approved_at,
  tenant_approved_by,
  finalized_at
)
SELECT
  seeded_contract.id,
  seeded_contract.deposit_amount_eur,
  110.00,
  8.46,
  seeded_contract.deposit_amount_eur - 110.00,
  110.00,
  jsonb_build_array(
    jsonb_build_object(
      'room_type', 'kuhinja',
      'reason', 'Ostecenje fronte kuhinjskog elementa',
      'amount_eur', 85
    ),
    jsonb_build_object(
      'room_type', 'kupatilo',
      'reason', 'Dubinsko ciscenje i uklanjanje kamenca',
      'amount_eur', 25
    )
  ),
  '[]'::jsonb,
  'automatic',
  FALSE,
  'Automatski obracun na osnovu dve evidentirane stavke koje prevazilaze redovno habanje.',
  TIMESTAMPTZ '2027-03-31 21:00:00+02',
  seeded_contract.landlord_id,
  TIMESTAMPTZ '2027-03-31 21:10:00+02',
  seeded_contract.tenant_id,
  TIMESTAMPTZ '2027-03-31 21:30:00+02'
FROM seeded_contract
WHERE NOT EXISTS (
  SELECT 1
  FROM settlements s
  WHERE s.contract_id = seeded_contract.id
);

-- Audit trail that mirrors the seeded contract lifecycle.
WITH seeded_contract AS (
  SELECT
    c.id AS contract_id,
    c.landlord_id,
    c.tenant_id
  FROM contracts c
  WHERE c.invite_code = 'RSMART001'
)
INSERT INTO audit_events (
  contract_id,
  event_type,
  actor_id,
  actor_role,
  data,
  event_hash,
  previous_hash,
  created_at
)
SELECT
  seeded_contract.contract_id,
  v.event_type::audit_event_type,
  v.actor_id,
  v.actor_role,
  v.data,
  v.event_hash,
  v.previous_hash,
  v.created_at
FROM seeded_contract
JOIN LATERAL (
  VALUES
    (
      'CONTRACT_CREATED',
      seeded_contract.landlord_id,
      'landlord',
      jsonb_build_object('invite_code', 'RSMART001'),
      '1000000000000000000000000000000000000000000000000000000000000001',
      NULL,
      TIMESTAMPTZ '2026-03-30 12:00:00+02'
    ),
    (
      'INVITE_SENT',
      seeded_contract.landlord_id,
      'landlord',
      jsonb_build_object('channel', 'sms', 'phone', '+381697654321'),
      '1000000000000000000000000000000000000000000000000000000000000002',
      '1000000000000000000000000000000000000000000000000000000000000001',
      TIMESTAMPTZ '2026-03-30 12:05:00+02'
    ),
    (
      'CONTRACT_ACCEPTED',
      seeded_contract.tenant_id,
      'tenant',
      jsonb_build_object('accepted_via', 'mobile_app'),
      '1000000000000000000000000000000000000000000000000000000000000003',
      '1000000000000000000000000000000000000000000000000000000000000002',
      TIMESTAMPTZ '2026-03-30 14:10:00+02'
    ),
    (
      'DEPOSIT_LOCKED',
      seeded_contract.landlord_id,
      'system',
      jsonb_build_object('amount_eur', 1300),
      '1000000000000000000000000000000000000000000000000000000000000004',
      '1000000000000000000000000000000000000000000000000000000000000003',
      TIMESTAMPTZ '2026-03-31 09:00:00+02'
    ),
    (
      'CHECKIN_COMPLETED',
      seeded_contract.tenant_id,
      'tenant',
      jsonb_build_object('images_uploaded', 5),
      '1000000000000000000000000000000000000000000000000000000000000005',
      '1000000000000000000000000000000000000000000000000000000000000004',
      TIMESTAMPTZ '2026-04-01 10:30:00+02'
    ),
    (
      'CHECKOUT_COMPLETED',
      seeded_contract.landlord_id,
      'landlord',
      jsonb_build_object('images_uploaded', 5),
      '1000000000000000000000000000000000000000000000000000000000000006',
      '1000000000000000000000000000000000000000000000000000000000000005',
      TIMESTAMPTZ '2027-03-31 18:45:00+02'
    ),
    (
      'LLM_ANALYSIS_COMPLETED',
      seeded_contract.landlord_id,
      'system',
      jsonb_build_object('rooms_analyzed', 5, 'model', 'mock-gpt-analysis-v1'),
      '1000000000000000000000000000000000000000000000000000000000000007',
      '1000000000000000000000000000000000000000000000000000000000000006',
      TIMESTAMPTZ '2027-03-31 20:20:00+02'
    ),
    (
      'SETTLEMENT_FINALIZED',
      seeded_contract.tenant_id,
      'system',
      jsonb_build_object('tenant_receives_eur', 1190, 'landlord_receives_eur', 110),
      '1000000000000000000000000000000000000000000000000000000000000008',
      '1000000000000000000000000000000000000000000000000000000000000007',
      TIMESTAMPTZ '2027-03-31 21:30:00+02'
    )
) AS v(event_type, actor_id, actor_role, data, event_hash, previous_hash, created_at) ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM audit_events ae
  WHERE ae.contract_id = seeded_contract.contract_id
);
