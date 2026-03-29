# RentSmart — Tehnička Specifikacija za MVP

**Verzija:** 1.0
**Datum:** 28. mart 2026.
**Tip dokumenta:** Tehnička specifikacija za hakaton MVP (5 dana)
**Tim:** 3 osobe (Frontend, Backend, AI/Blockchain)

---

## 1. Pregled sistema

RentSmart je mobilna aplikacija koja rešava problem poverenja i transparentnosti u procesu iznajmljivanja stanova. Sistem koristi kombinaciju smart contract state machine-a, Gemini Vision LLM analize slika i determinističkog rule engine-a za automatizovano upravljanje depozitima i objektivnu procenu štete.

### 1.1 Ključne arhitektonske odluke

| Odluka | Izbor | Obrazloženje |
|--------|-------|-------------|
| Povezivanje korisnika | Invite link sa kodom | Stanodavac kreira ugovor, šalje link stanaru |
| Ko slika | Stanodavac → check-in, Stanar → check-out | Svaka strana dokumentuje stanje koje predaje/prima |
| Potvrda slika | Obe strane potvrđuju + opcija odbijanja | Odbijanje sa komentarom → ponovo slikati |
| Uparivanje slika | Referentni thumbnailovi pri check-out-u | Check-out prikazuje check-in slike kao vodič |
| Baza podataka | PostgreSQL (Supabase) | Perzistentno, besplatan tier, ekosistem |
| Image storage | Supabase Storage | Isti ekosistem, besplatan do 1GB |
| LLM provajder | Google Gemini Pro Vision | Najjeftiniji, dobar za slike, velikodušan free tier |
| LLM strategija | Parovi pre/posle po prostoriji | Fokusiran kontekst, preciznije poređenje |
| Rule engine | Fiksne vrednosti (3% / 10% / 25%) | Deterministički, bez ambiguiteta |
| Auth | Phone + SMS OTP (Firebase Auth) | Realan auth za demo, mock fallback |
| Offline | Zahteva internet | Pojednostavljuje MVP |
| Smart contract | State machine + Solana Devnet (Anchor) | State machine primarno, Solana PDA za escrow i hash zapis |
| Validacija inputa | Zod (runtime type-safe) | Runtime validacija + generisanje TypeScript tipova iz šema |
| Deljeni API kontrakti | Workspace paket `packages/contracts` | Jedan izvor istine za Zod šeme i TypeScript tipove koje koriste backend i mobile |
| Backend struktura | Domain modules (modularni) | Svaki domen (auth, contracts, inspections, analysis, audit, blockchain) je izolovani modul sa routes/service/schema |
| Kompresija slika | Preporučen resize na 1920px | Nije obavezan za MVP, ali sprečava storage overflow |

---

## 2. Arhitektura sistema

```
┌──────────────────────────────────────────────────────────┐
│                  MOBILNA APLIKACIJA                      │
│               React Native (Expo)                        │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Auth     │ │ Kreiranje│ │ Kamera   │ │ Settlement  │  │
│  │ (Phone   │ │ Ugovora  │ │ (Check-  │ │ + Audit     │  │
│  │  OTP)    │ │ + Sažetak│ │ in/out)  │ │ Trail       │  │
│  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │
│  ┌──────────────────────────────────────────────────────┐│
│  │  expo-camera + expo-location + expo-image-manipulator││
│  └──────────────────────────────────────────────────────┘│
└────────────────────────┬─────────────────────────────────┘
                         │ REST API (HTTPS)
┌────────────────────────▼─────────────────────────────────┐
│                  BACKEND — Node.js (Express)             │
│                  TypeScript (strict mode)                │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ shared/middleware: auth · errorHandler · validate(Zod)││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─────────────── Domain Modules ──────────────────────┐ │
│  │                                                     │ │
│  │  ┌──────────┐ ┌────────────┐ ┌─────────────┐        │ │
│  │  │  auth    │ │ contracts  │ │ inspections │        │ │
│  │  │ routes   │ │ routes     │ │ routes      │        │ │
│  │  │ service  │ │ service    │ │ service     │        │ │
│  │  │ schema   │ │ schema     │ │ schema      │        │ │
│  │  │          │ │ stateMach. │ │ imageService│        │ │
│  │  │          │ │ invite     │ │ metaValid.  │        │ │
│  │  └──────────┘ └────────────┘ └─────────────┘        │ │
│  │                                                     │ │
│  │  ┌──────────┐ ┌────────────┐ ┌─────────────┐        │ │
│  │  │ analysis │ │   audit    │ │ blockchain  │        │ │
│  │  │ routes   │ │ routes     │ │ routes      │        │ │
│  │  │ service  │ │ service    │ │ solanaServ. │        │ │
│  │  │ llmServ. │ │ (hash      │ │ (Anchor     │        │ │
│  │  │ ruleEng. │ │  chain)    │ │  client)    │        │ │
│  │  │ schema   │ │            │ │             │        │ │
│  │  └──────────┘ └────────────┘ └─────────────┘        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ shared: types · db/client · utils (hash, geo, errors)│ │
│  │ config: env.ts (Zod-validated environment)           │ │
│  └──────────────────────────────────────────────────────┘ │
└───────┬────────────────┬───────────────┬───────────-──────┘
        │                │               │
   ┌────▼────────┐  ┌────▼────────┐  ┌───▼────────────┐
   │  Supabase   │  │  Supabase   │  │ Google Gemini  │
   │  PostgreSQL │  │  Storage    │  │ Pro Vision API │
   │  (pg Pool)  │  │  (slike)    │  │                │
   └─────────────┘  └─────────────┘  └────────────────┘
        │
   ┌────▼────────┐
   │  Solana     │
   │  Devnet     │
   │  (Anchor    │
   │   program)  │
   └─────────────┘
```

---
### 2.1 Backend struktura (domain modules)

\`\`\`
src/
├── index.ts                    # Entry: import app, listen on PORT
├── app.ts                      # Express setup: middleware, mount module routers
├── modules/
│   ├── auth/
│   │   ├── auth.routes.ts
│   │   ├── auth.service.ts
│   │   └── auth.schema.ts      # Zod validacija
│   ├── contracts/
│   │   ├── contracts.routes.ts
│   │   ├── contracts.service.ts
│   │   ├── contracts.schema.ts
│   │   ├── stateMachine.ts     # STATE_TRANSITIONS + TRANSITION_ACTORS
│   │   └── inviteService.ts
│   ├── inspections/
│   │   ├── inspections.routes.ts
│   │   ├── inspections.service.ts
│   │   ├── inspections.schema.ts
│   │   ├── imageService.ts     # Supabase Storage upload/download
│   │   └── metadataValidator.ts # GPS, timestamp, device validacija
│   ├── analysis/
│   │   ├── analysis.routes.ts
│   │   ├── analysis.service.ts  # Orchestrator: images → LLM → rule engine → save
│   │   ├── llmService.ts       # Gemini Vision API + mock
│   │   ├── ruleEngine.ts       # Deterministička raspodela (čista funkcija)
│   │   └── analysis.schema.ts
│   ├── audit/
│   │   ├── audit.routes.ts
│   │   └── audit.service.ts    # Hash chain logger + verifikacija
│   └── blockchain/
│       ├── blockchain.routes.ts
│       └── solana.service.ts   # Anchor klijent za Solana program
├── shared/
│   ├── types/
│   │   ├── index.ts            # SVI domenski tipovi — jedan source of truth
│   │   └── express.d.ts        # Augment Request sa user: User
│   ├── middleware/
│   │   ├── auth.ts             # Firebase verify + mock auth
│   │   ├── errorHandler.ts     # asyncHandler + centralni error handler
│   │   └── validate.ts         # zodMiddleware(schema)
│   ├── db/
│   │   ├── client.ts           # pg Pool (SQL) + Supabase client (Storage)
│   │   └── migrations/
│   │       └── 001_initial.sql
│   └── utils/
│       ├── hash.ts             # SHA-256 helperi
│       ├── geo.ts              # Haversine distance
│       └── errors.ts           # AppError klasa sa statusCode
└── config/
└── env.ts                  # Zod šema za SVE env varijable
\`\`\`

**Pravila modularnosti:**
- Svaki modul ima: routes (HTTP layer), service (biznis logika), schema (Zod validacija)
- Routes NIKAD ne sadrže biznis logiku — delegiraju na service
- Dozvoljene zavisnosti: auth→shared, contracts→shared+audit, inspections→shared+audit+contracts, analysis→shared+audit+contracts+inspections, audit→shared, blockchain→shared
- NIKAD cirkularne zavisnosti
- Deljeni API i domenski tipovi žive u `packages/contracts/src` — nikad ih ne duplirati u server i mobile aplikaciji

## 3. Baza podataka — PostgreSQL Schema

### 3.1 Tabela: `users`

```sql
CREATE TABLE users (
   id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   phone         VARCHAR(20) UNIQUE NOT NULL,
   display_name  VARCHAR(100) NOT NULL,
   firebase_uid  VARCHAR(128) UNIQUE NOT NULL,
   device_id     VARCHAR(255),
   solana_pubkey VARCHAR(44),                          -- Solana wallet adresa (opciono)
   created_at    TIMESTAMPTZ DEFAULT NOW(),
   updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
```

### 3.2 Tabela: `contracts`

```sql
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

CREATE TABLE contracts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id           UUID NOT NULL REFERENCES users(id),
  tenant_id             UUID REFERENCES users(id),           -- NULL dok stanar ne prihvati
  invite_code           VARCHAR(12) UNIQUE NOT NULL,
  property_address      TEXT NOT NULL,
  property_gps_lat      DECIMAL(10, 7),
  property_gps_lng      DECIMAL(10, 7),
  rent_monthly_eur      DECIMAL(10, 2) NOT NULL,
  deposit_amount_eur    DECIMAL(10, 2) NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  deposit_rules         TEXT,                                 -- slobodan tekst pravila
  notes                 TEXT,
  plain_language_summary TEXT,                                -- generisan sažetak
  status                contract_status DEFAULT 'draft',
  deposit_status        deposit_status DEFAULT 'pending',
  contract_hash         VARCHAR(64),                          -- SHA-256 svih uslova
  rejection_comment     TEXT,                                 -- komentar pri odbijanju slika
  solana_pda            VARCHAR(44),                          -- Solana PDA adresa
  solana_tx_init        VARCHAR(88),                          -- TX potpis inicijalizacije
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contracts_landlord ON contracts(landlord_id);
CREATE INDEX idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX idx_contracts_invite ON contracts(invite_code);
CREATE INDEX idx_contracts_status ON contracts(status);
```

### 3.3 Tabela: `rooms`

```sql
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

CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  room_type     room_type NOT NULL,
  custom_name   VARCHAR(100),                         -- za tip 'druga'
  is_mandatory  BOOLEAN DEFAULT TRUE,
  display_order SMALLINT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rooms_contract ON rooms(contract_id);
```

### 3.4 Tabela: `inspection_images`

```sql
CREATE TYPE inspection_type AS ENUM ('checkin', 'checkout');

CREATE TABLE inspection_images (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id       UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  room_id           UUID NOT NULL REFERENCES rooms(id),
  inspection_type   inspection_type NOT NULL,
  image_url         TEXT NOT NULL,                    -- Supabase Storage URL
  image_hash        VARCHAR(64) NOT NULL,             -- SHA-256 slike za integritet
  captured_at       TIMESTAMPTZ NOT NULL,             -- timestamp sa uređaja
  gps_lat           DECIMAL(10, 7),
  gps_lng           DECIMAL(10, 7),
  device_id         VARCHAR(255) NOT NULL,
  note              TEXT,                              -- opciona napomena korisnika
  image_index       SMALLINT NOT NULL,                 -- redosled unutar prostorije
  uploaded_by       UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_images_contract ON inspection_images(contract_id);
CREATE INDEX idx_images_room ON inspection_images(room_id);
CREATE INDEX idx_images_type ON inspection_images(inspection_type);
```

### 3.5 Tabela: `analysis_results`

```sql
CREATE TABLE analysis_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  room_id         UUID NOT NULL REFERENCES rooms(id),
  raw_llm_response JSONB NOT NULL,                    -- kompletan LLM odgovor
  findings        JSONB NOT NULL DEFAULT '[]',        -- parsirani nalazi
  summary         TEXT,
  overall_condition VARCHAR(20),                      -- excellent / good / fair / damaged
  analyzed_at     TIMESTAMPTZ DEFAULT NOW(),
  llm_model       VARCHAR(50),                        -- npr. 'gemini-1.5-pro-vision'
  llm_tokens_used INTEGER,
  llm_cost_usd    DECIMAL(8, 4)
);

CREATE INDEX idx_analysis_contract ON analysis_results(contract_id);
```

### 3.6 Tabela: `settlements`

```sql
CREATE TYPE settlement_type AS ENUM ('automatic', 'manual_review');

CREATE TABLE settlements (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id             UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  deposit_amount_eur      DECIMAL(10, 2) NOT NULL,
  total_deduction_eur     DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_deduction_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  tenant_receives_eur     DECIMAL(10, 2) NOT NULL,
  landlord_receives_eur   DECIMAL(10, 2) NOT NULL,
  deductions              JSONB NOT NULL DEFAULT '[]',   -- lista odbitaka
  skipped_findings        JSONB NOT NULL DEFAULT '[]',   -- preskočeni (wear&tear, low confidence)
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
```

### 3.7 Tabela: `audit_events`

```sql
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
  'SETTLEMENT_APPROVED',
  'SETTLEMENT_FINALIZED',
  'DEPOSIT_RELEASED',
  'CONTRACT_HASH_STORED',
  'CONTRACT_CANCELLED'
);

CREATE TABLE audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  event_type    audit_event_type NOT NULL,
  actor_id      UUID REFERENCES users(id),            -- ko je pokrenuo akciju
  actor_role    VARCHAR(20),                           -- 'landlord' | 'tenant' | 'system'
  data          JSONB DEFAULT '{}',                    -- event-specific podaci
  event_hash    VARCHAR(64) NOT NULL,                  -- SHA-256(previous_hash + this_event)
  previous_hash VARCHAR(64),                           -- hash prethodnog eventa (chain)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_contract ON audit_events(contract_id);
CREATE INDEX idx_audit_type ON audit_events(event_type);
CREATE INDEX idx_audit_created ON audit_events(created_at);
```

---

## 4. State Machine — Lifecycle ugovora

### 4.1 Prošireni dijagram stanja

```
                    ┌─────────┐
                    │  draft   │
                    └────┬─────┘
                         │ stanodavac šalje invite link
                    ┌────▼──────────────┐
                    │ pending_acceptance │
                    └────┬──────────────┘
                         │ stanar prihvata
                    ┌────▼─────┐
                    │ accepted │
                    └────┬─────┘
                         │ stanodavac pokreće check-in
               ┌─────────▼──────────────┐
               │ checkin_in_progress     │
               └─────────┬──────────────┘
                         │ stanodavac završava slikanje
          ┌──────────────▼───────────────────┐
          │ checkin_pending_approval          │
          └──┬───────────────────────────┬───┘
             │ stanar odobrava           │ stanar odbija + komentar
        ┌────▼────┐              ┌───────▼──────────┐
        │ active  │              │ checkin_rejected  │
        └────┬────┘              └───────┬───────────┘
             │                           │ stanodavac ponovo slika
             │                  ┌────────▼───────────────┐
             │                  │ checkin_in_progress     │ ← (loop)
             │                  └────────────────────────┘
             │ stanar pokreće check-out
   ┌─────────▼──────────────┐
   │ checkout_in_progress   │
   └─────────┬──────────────┘
             │ stanar završava slikanje
  ┌──────────▼───────────────────┐
  │ checkout_pending_approval    │
  └──┬───────────────────────┬───┘
     │ stanodavac odobrava    │ stanodavac odbija + komentar
     │                   ┌───▼──────────────┐
     │                   │ checkout_rejected │
     │                   └───┬──────────────┘
     │                       │ stanar ponovo slika
     │              ┌────────▼───────────────┐
     │              │ checkout_in_progress   │ ← (loop)
     │              └────────────────────────┘
┌────▼────────────┐
│ pending_analysis│
└────┬────────────┘
     │ LLM + rule engine završavaju
┌────▼───────┐
│ settlement │
└────┬───────┘
     │ finalize (potvrda)
┌────▼──────┐
│ completed │
└───────────┘
```

### 4.2 Deposit status lifecycle

`deposit_status` prati stanje depozita nezavisno od `contract_status`:

| Tranzicija | Kada | Uslov |
|------------|------|-------|
| `pending` | Kreiranje ugovora | Početno stanje |
| `pending → locked` | Stanar prihvata ugovor (`accepted`) | Depozit je osiguran (Solana escrow ili off-chain) |
| `locked → fully_released` | Settlement finalizovan | `total_deduction_eur == 0` — ceo depozit se vraća stanaru |
| `locked → partially_released` | Settlement finalizovan | `0 < total_deduction_eur < deposit_amount_eur` — depozit se deli |
| `locked → claimed` | Settlement finalizovan | `total_deduction_eur == deposit_amount_eur` — ceo depozit ide stanodavcu |

Backend ažurira `deposit_status` automatski pri `settlement → completed` tranziciji, na osnovu `total_deduction_eur` iz settlement-a.

### 4.3 Dozvoljena stanja i tranzicije (validacija u backendu)

```javascript
const STATE_TRANSITIONS = {
  'draft':                      ['pending_acceptance', 'cancelled'],
  'pending_acceptance':         ['accepted', 'cancelled'],
  'accepted':                   ['checkin_in_progress', 'cancelled'],
  'checkin_in_progress':        ['checkin_pending_approval'],
  'checkin_pending_approval':   ['active', 'checkin_rejected'],
  'checkin_rejected':           ['checkin_in_progress'],
  'active':                     ['checkout_in_progress'],
  'checkout_in_progress':       ['checkout_pending_approval'],
  'checkout_pending_approval':  ['pending_analysis', 'checkout_rejected'],
  'checkout_rejected':          ['checkout_in_progress'],
  'pending_analysis':           ['settlement'],
  'settlement':                 ['completed'],
  'completed':                  []
};

// Ko može pokrenuti koju tranziciju
const TRANSITION_ACTORS = {
  'draft → pending_acceptance':          'landlord',    // šalje invite
  'pending_acceptance → accepted':       'tenant',      // prihvata
  'accepted → checkin_in_progress':      'landlord',    // pokreće check-in
  'checkin_in_progress → checkin_pending_approval': 'landlord', // završava slikanje
  'checkin_pending_approval → active':   'tenant',      // odobrava slike
  'checkin_pending_approval → checkin_rejected': 'tenant', // odbija slike
  'checkin_rejected → checkin_in_progress': 'landlord', // ponovo slika
  'active → checkout_in_progress':       'tenant',      // pokreće check-out
  'checkout_in_progress → checkout_pending_approval': 'tenant', // završava slikanje
  'checkout_pending_approval → pending_analysis': 'landlord', // odobrava slike
  'checkout_pending_approval → checkout_rejected': 'landlord', // odbija slike
  'checkout_rejected → checkout_in_progress': 'tenant', // ponovo slika
  'pending_analysis → settlement':       'system',      // LLM + rule engine
  'settlement → completed':             'both',         // status prelazi tek kada obe strane posebno odobre settlement
  'draft → cancelled':                  'landlord',     // otkazuje pre slanja invite-a
  'pending_acceptance → cancelled':     'landlord',     // otkazuje pre prihvatanja
  'accepted → cancelled':              'both'           // bilo koja strana može otkazati pre check-in-a
};
```

---

## 5. API Specifikacija

Base URL: `https://<backend-host>/api/v1`

Svi endpoint-i osim `/auth/*` i `/contracts/invite/:code` zahtevaju `Authorization: Bearer <firebase_id_token>` header.
Backend NE izdaje sopstveni session JWT za MVP. Mobile čuva i osvežava Firebase ID token preko Firebase SDK-a.

Svi endpoint-i koji primaju request body koriste Zod validaciju (runtime type-safe).
Validacija se primenjuje kroz `zodMiddleware(schema)` u route chain-u.
Ako validacija ne prođe, vraća se 400 sa detaljnim opisom grešaka:

\`\`\`json
{
"error": "Validation failed",
"details": {
"property_address": ["Required"],
"deposit_amount_eur": ["Number must be greater than 0"]
}
}
\`\`\`
### 5.1 Auth

| Method | Endpoint | Opis | Body |
|--------|----------|------|------|
| POST | `/auth/verify` | Verifikuje Firebase token, kreira/ažurira korisnika | `{ firebase_token, display_name, device_id }` |
| GET | `/auth/me` | Vraća profil trenutnog korisnika | — |

**POST `/auth/verify`** — Response:
```json
{
  "user": {
    "id": "uuid",
    "phone": "+381641234567",
    "display_name": "Marko Petrović",
    "device_id": "expo-abc123"
  },
  "auth_source": "firebase"
}
```

### 5.2 Contracts

| Method | Endpoint | Opis |
|--------|----------|------|
| POST | `/contracts` | Kreiranje ugovora (landlord) |
| GET | `/contracts` | Lista mojih ugovora (filtrira po user role) |
| GET | `/contracts/:id` | Detalji ugovora |
| POST | `/contracts/:id/accept` | Prihvatanje ugovora (tenant, preko invite koda) |
| POST | `/contracts/:id/cancel` | Otkazivanje ugovora |
| GET | `/contracts/invite/:code` | Pregled ugovora preko invite koda (pre prihvatanja) |

**POST `/contracts`** — Request:
```json
{
  "property_address": "Bulevar Kralja Aleksandra 73, Beograd",
  "property_gps": { "lat": 44.8125, "lng": 20.4612 },
  "rent_monthly_eur": 400,
  "deposit_amount_eur": 800,
  "start_date": "2026-04-01",
  "end_date": "2027-04-01",
  "deposit_rules": "Depozit se vraća u celosti ako nema oštećenja. Normalno habanje se ne računa.",
  "notes": "Kućni ljubimci nisu dozvoljeni.",
  "rooms": [
    { "room_type": "kuhinja", "is_mandatory": true },
    { "room_type": "kupatilo", "is_mandatory": true },
    { "room_type": "dnevna_soba", "is_mandatory": true },
    { "room_type": "spavaca_soba", "is_mandatory": true },
    { "room_type": "balkon", "is_mandatory": false }
  ]
}
```

**POST `/contracts`** — Response:
```json
{
  "contract": {
    "id": "contract_001",
    "invite_code": "RS-A7X2K9",
    "invite_link": "https://rentsmart.app/invite/RS-A7X2K9",
    "plain_language_summary": "Marko izdaje stan na Bul. Kralja Aleksandra 73 Ani na 12 meseci...",
    "contract_hash": "sha256:a1b2c3d4...",
    "status": "draft"
  }
}
```

### 5.3 Inspections (Check-in / Check-out)

| Method | Endpoint | Opis |
|--------|----------|------|
| POST | `/contracts/:id/checkin/start` | Započni check-in (landlord) |
| POST | `/contracts/:id/checkin/images` | Upload slika za jednu prostoriju |
| POST | `/contracts/:id/checkin/complete` | Završi check-in → pending_approval |
| POST | `/contracts/:id/checkin/approve` | Stanar odobrava check-in slike |
| POST | `/contracts/:id/checkin/reject` | Stanar odbija check-in slike |
| POST | `/contracts/:id/checkout/start` | Započni check-out (tenant) |
| POST | `/contracts/:id/checkout/images` | Upload slika za jednu prostoriju |
| POST | `/contracts/:id/checkout/complete` | Završi check-out → pending_approval |
| POST | `/contracts/:id/checkout/approve` | Stanodavac odobrava check-out slike |
| POST | `/contracts/:id/checkout/reject` | Stanodavac odbija check-out slike |
| GET | `/contracts/:id/checkin/images` | Dohvati check-in slike (za referentne thumbnailove) |

**POST `/contracts/:id/checkin/images`** — Request (multipart/form-data):
```
images[]:         File[] (1-10 slika za jednu prostoriju)
room_id:          UUID
captured_at[]:    ISO timestamp po slici
gps_lat[]:        number po slici
gps_lng[]:        number po slici
device_id[]:      string po slici
notes[]:          string[] (opciona napomena po slici)
```

**POST `/contracts/:id/checkin/reject`** — Request:
```json
{
  "comment": "Slike kupatila su zamućene, molim ponovo uslikajte."
}
```

**Metadata validacija (backend middleware):**
```javascript
function validateImageMetadata(contractGps, imageMetadata) {
  const errors = [];

  // 1. Timestamp: unutar 1h od serverskog vremena
  const timeDiff = Math.abs(Date.now() - new Date(imageMetadata.captured_at).getTime());
  if (timeDiff > 3600000) {
    errors.push('Timestamp slike je van dozvoljenog opsega (±1h)');
  }

  // 2. GPS: unutar 200m od adrese stana
  const distance = haversineDistance(
    contractGps.lat, contractGps.lng,
    imageMetadata.gps_lat, imageMetadata.gps_lng
  );
  if (distance > 200) {
    errors.push(`GPS lokacija slike je ${distance}m od adrese stana (max 200m)`);
  }

  // 3. Device ID: konzistentan tokom celog check-in-a
  // (provera se radi na nivou sesije, ne pojedinačne slike)

  return { valid: errors.length === 0, errors };
}
```

### 5.4 Analysis & Settlement

| Method | Endpoint | Opis |
|--------|----------|------|
| POST | `/contracts/:id/analyze` | Pokreni LLM analizu (sistem, automatski) |
| GET | `/contracts/:id/analysis` | Rezultati analize po prostoriji |
| GET | `/contracts/:id/settlement` | Settlement breakdown |
| POST | `/contracts/:id/settlement/approve` | Evidentira approval trenutnog korisnika; kada obe strane odobre, settlement se finalizuje |

### 5.5 Audit Trail

| Method | Endpoint | Opis |
|--------|----------|------|
| GET | `/contracts/:id/audit` | Kompletan audit trail za ugovor |

**GET `/contracts/:id/audit`** — Response:
```json
{
  "events": [
    {
      "id": "evt_001",
      "event_type": "CONTRACT_CREATED",
      "actor_role": "landlord",
      "data": { "contract_hash": "sha256:..." },
      "event_hash": "sha256:abc...",
      "previous_hash": null,
      "created_at": "2026-03-28T10:00:00Z"
    },
    {
      "id": "evt_002",
      "event_type": "INVITE_SENT",
      "actor_role": "landlord",
      "data": { "invite_code": "RS-A7X2K9", "method": "link" },
      "event_hash": "sha256:def...",
      "previous_hash": "sha256:abc...",
      "created_at": "2026-03-28T10:01:00Z"
    }
  ],
  "chain_valid": true
}
```
### 5.6 Blockchain verifikacija

| Method | Endpoint | Opis |
|--------|----------|------|
| — | Nema zasebnog MVP endpoint-a | Solana status je interni verifikacioni layer backend-a |

**GET `/contracts/:id/blockchain`** — Response:
Napomena: ovaj payload je interni primer, ne response zasebnog MVP endpoint-a.

\`\`\` json
{
"on_chain": true,
"agreement": {
"contract_hash": "a1b2c3...",
"landlord": "7xKX...pubkey",
"tenant": "3yMN...pubkey",
"deposit_lamports": 4000000,
"state": 1,
"checkin_hash": "d4e5f6...",
"checkout_hash": "000000...",
"settlement_hash": "000000..."
},
"explorer_url": "https://explorer.solana.com/address/...?cluster=devnet"
}
\`\`\`
---

## 6. Auth & Invite Flow

### 6.1 Firebase Phone Auth

```
Korisnik → Unosi phone number → Firebase šalje SMS OTP
         → Unosi OTP → Firebase vraća ID token
         → Šalje token na backend → Backend verifikuje sa Firebase Admin SDK
         → Kreira/ažurira korisnika u PostgreSQL → Vraća normalizovan user payload
```

**Backend verifikacija:**
```javascript
const admin = require('firebase-admin');

async function verifyFirebaseToken(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = await findOrCreateUser(decoded);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

**Mock Auth Fallback (ako Firebase zapne):**
```javascript
// Samo za development/hakaton
if (process.env.MOCK_AUTH === 'true') {
  // Header: X-Mock-User: landlord_marko ili tenant_ana
  const mockUsers = {
    'landlord_marko': { id: 'mock-1', phone: '+381641111111', display_name: 'Marko Petrović' },
    'tenant_ana':     { id: 'mock-2', phone: '+381642222222', display_name: 'Ana Jovanović' }
  };
}
```

### 6.2 Invite Link Flow

```
1. Stanodavac kreira ugovor → sistem generiše invite_code (npr. "RS-A7X2K9")
2. Sistem generiše deep link: rentsmart://invite/RS-A7X2K9
   (ili fallback web URL: https://rentsmart.app/invite/RS-A7X2K9)
3. Stanodavac šalje link stanaru (SMS, WhatsApp, email — van sistema)
4. Stanar otvara link → aplikacija se otvara na invite ekranu
5. Stanar vidi ugovor (read-only preview) → "Prihvati ugovor"
6. Backend: POST /contracts/:id/accept
   → status: pending_acceptance → accepted
   → tenant_id se popunjava
   → audit event: CONTRACT_ACCEPTED
```

**Invite kod format:** `RS-` + 6 alfanumeričkih karaktera (uppercase, bez sličnih: 0/O, 1/I/L)
**Charset:** `A B C D E F G H J K M N P Q R S T U V W X Y Z 2 3 4 5 6 7 8 9`

```javascript
function generateInviteCode() {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = 'RS-';
  for (let i = 0; i < 6; i++) {
    code += charset[Math.floor(Math.random() * charset.length)];
  }
  return code;
}
```

---

## 7. Camera & Image Flow

### 7.1 Check-in Flow (stanodavac slika)

```
1. Stanodavac otvara "Započni check-in"
2. Aplikacija proverava:
   - Internet konekcija postoji
   - Camera permission odobren
   - Location permission odobren
   - GPS signal dostupan
   - Ugovor je u statusu 'accepted' ili 'checkin_rejected'
3. Prikazuje listu prostorija (definisane pri kreiranju ugovora)
4. Za svaku prostoriju:
   a. Otvara fullscreen kameru sa overlay-em:
      - Naziv prostorije
      - Brojač slika: "3/3 minimum"
      - Progress: "Kuhinja ✓ | Kupatilo (2/3) | ..."
   b. Korisnik slika minimum 3 slike po obaveznoj prostoriji
   c. Posle svake slike:
      - Preview + "Ponovi" / "Dodaj napomenu" / "Dalje"
   d. Automatski se beleži: timestamp, GPS, device_id
   e. Slika se hash-ira (SHA-256) za integritet
5. Kad su sve obavezne prostorije pokrivene:
   - "Završi check-in" dugme se aktivira
   - Upload svih slika na Supabase Storage (sa progress bar-om)
   - API pozivi: POST /checkin/images za svaku prostoriju
   - API poziv: POST /checkin/complete
6. Status → checkin_pending_approval
7. Stanar dobija notifikaciju (ili pull-to-refresh) da pregleda slike
```

### 7.2 Check-out Flow (stanar slika)

```
1. Stanar otvara "Započni check-out"
2. Iste provere kao check-in
3. Aplikacija prikazuje listu prostorija iz check-in-a
4. Za svaku prostoriju:
   a. Prikazuje thumbnail galeriju check-in slika te prostorije
      (downloadovane sa Supabase Storage)
   b. Vodič: "Pokušajte uslikati iz istog ugla kao pri useljenju"
   c. Otvara kameru sa overlay-em
   d. Isti flow kao check-in (minimum 3 slike, napomene, metadata)
5. Kad su sve prostorije pokrivene:
   - Upload + complete
6. Status → checkout_pending_approval
7. Stanodavac pregleda i odobrava/odbija
8. Ako odobreno → status → pending_analysis → automatski LLM poziv
```

### 7.3 Supabase Storage struktura

```
rentsmart-images/
├── {contract_id}/
│   ├── checkin/
│   │   ├── kuhinja/
│   │   │   ├── img_001_{hash}.jpg
│   │   │   ├── img_002_{hash}.jpg
│   │   │   └── img_003_{hash}.jpg
│   │   ├── kupatilo/
│   │   │   └── ...
│   │   └── dnevna_soba/
│   │       └── ...
│   └── checkout/
│       ├── kuhinja/
│       │   └── ...
│       └── ...
```

### 7.4 Expo Camera implementacija (ključni delovi)

```javascript
// KRITIČNO: Koristiti SAMO expo-camera, NIKADA expo-image-picker
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';

async function captureImage(cameraRef) {
  // 1. Slikaj
  const photo = await cameraRef.current.takePictureAsync({
    quality: 0.8,
    base64: false,
  });

  // 2. Preporučeni resize (sprečava storage overflow)
  const resized = await ImageManipulator.manipulateAsync(
    photo.uri,
    [{ resize: { width: 1920 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );

  // 3. GPS
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  // 4. Hash za integritet
  const fileContent = await FileSystem.readAsStringAsync(resized.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    fileContent
  );

  return {
    uri: resized.uri,
    captured_at: new Date().toISOString(),
    gps_lat: location.coords.latitude,
    gps_lng: location.coords.longitude,
    device_id: Constants.deviceId || Constants.installationId,
    image_hash: hash,
  };
}
```

---

## 8. LLM Integracija — Google Gemini Pro Vision

### 8.1 Strategija: Parovi po prostoriji

Za svaku prostoriju se šalje jedan API poziv sa svim check-in slikama i svim check-out slikama te prostorije. LLM poredi parove i vraća strukturisan JSON.

```
Za 4 prostorije × (3+3 slike) = 4 API poziva × 6 slika = 24 slike ukupno
Procenjeni cost: ~$0.05-0.15 po analizi (Gemini Pro Vision pricing)
Procenjeno vreme: ~10-20 sekundi po prostoriji, ~60 sekundi ukupno
```

### 8.2 API poziv

```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function analyzeRoom(roomName, checkinImages, checkoutImages) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  // Priprema slika kao parts
  const imageParts = [];

  // Check-in slike
  imageParts.push({ text: `--- BEFORE slike (check-in) za prostoriju: ${roomName} ---` });
  for (const img of checkinImages) {
    const imageData = await downloadImageAsBase64(img.image_url);
    imageParts.push({
      inlineData: { mimeType: 'image/jpeg', data: imageData }
    });
  }

  // Check-out slike
  imageParts.push({ text: `--- AFTER slike (check-out) za prostoriju: ${roomName} ---` });
  for (const img of checkoutImages) {
    const imageData = await downloadImageAsBase64(img.image_url);
    imageParts.push({
      inlineData: { mimeType: 'image/jpeg', data: imageData }
    });
  }

  // Prompt
  const prompt = buildAnalysisPrompt(roomName);

  const result = await model.generateContent([prompt, ...imageParts]);
  const response = await result.response;
  const text = response.text();

  return parseAnalysisResponse(text);
}
```

### 8.3 LLM Prompt

```
Ti si stručnjak za procenu stanja nekretnina. Dobijaš dve grupe slika
iste prostorije:
- Grupa "BEFORE" (check-in): stanje pri useljenju
- Grupa "AFTER" (check-out): stanje pri iseljenju

Tvoj zadatak je ISKLJUČIVO da identifikuješ i opišeš promene između
BEFORE i AFTER stanja. NE donosiš finansijske odluke. NE procenjuješ
troškove popravke.

Za svaku detektovanu promenu:
1. Opiši šta se promenilo (kratko, precizno)
2. Identifikuj predmet/površinu (zid, pod, vrata, prozor, nameštaj...)
3. Klasifikuj ozbiljnost:
   - "none" — nema vidljive promene
   - "minor" — sitna promena (mala fleka, površinska ogrebotina,
     manja mrlja)
   - "medium" — vidljivo oštećenje (rupa u zidu, oštećen pod,
     napukla pločica)
   - "major" — značajno oštećenje (slomljeno, razbijeno,
     velika šteta, nedostaje predmet)
4. Proceni svoju sigurnost (confidence) od 0.0 do 1.0
   - Koristi nižu vrednost ako su slike snimljene iz različitih
     uglova ili pri različitom osvetljenju
5. Naznači da li je promena "normalno habanje" (wear_and_tear):
   - true = izbledela boja, sitne ogrebotine od nameštaja,
     požuteli fugovi, habanje praga
   - false = novo oštećenje koje prevazilazi normalno korišćenje

Ako u BEFORE slikama postoji napomena korisnika o zatečenom oštećenju,
NE računaj to kao novo oštećenje u AFTER slikama.

Odgovori ISKLJUČIVO u JSON formatu, bez markdown formatiranja,
bez ```json blokova:

{
  "room": "naziv prostorije",
  "findings": [
    {
      "item": "naziv predmeta/površine",
      "description": "Opis promene — kratko i precizno",
      "severity": "none|minor|medium|major",
      "confidence": 0.0-1.0,
      "wear_and_tear": true|false,
      "location_in_image": "gde u slici se nalazi promena"
    }
  ],
  "summary": "Kratak ljudski razumljiv sažetak stanja prostorije",
  "overall_condition": "excellent|good|fair|damaged"
}

Ako nema promena, vrati prazan findings niz i overall_condition: "excellent".
```

### 8.4 Parsiranje LLM odgovora sa error handling-om

```javascript
function parseAnalysisResponse(rawText) {
  // 1. Očisti markdown formatiranje ako postoji
  let cleaned = rawText
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  // 2. Pokušaj parsiranje
  try {
    const parsed = JSON.parse(cleaned);
    return validateAnalysisSchema(parsed);
  } catch (e) {
    // 3. Pokušaj da pronađeš JSON u tekstu
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return validateAnalysisSchema(parsed);
      } catch (e2) {
        // 4. Fallback — vrati "analiza neuspešna"
        return {
          room: 'unknown',
          findings: [],
          summary: 'LLM analiza nije mogla da se parsira. Potrebna ručna provera.',
          overall_condition: 'unknown',
          parse_error: true,
          raw_response: rawText
        };
      }
    }
  }
}

function validateAnalysisSchema(data) {
  // Validacija obaveznih polja
  if (!data.room || !Array.isArray(data.findings)) {
    throw new Error('Invalid schema');
  }

  // Sanitizacija severity vrednosti
  const validSeverities = ['none', 'minor', 'medium', 'major'];
  data.findings = data.findings.map(f => ({
    ...f,
    severity: validSeverities.includes(f.severity) ? f.severity : 'minor',
    confidence: Math.max(0, Math.min(1, parseFloat(f.confidence) || 0.5)),
    wear_and_tear: Boolean(f.wear_and_tear)
  }));

  return data;
}
```

### 8.5 Mock LLM Response (fallback za demo)

```javascript
// Ako Gemini API ne radi, koristi hardkodirani odgovor
const MOCK_RESPONSES = {
  'dnevna_soba': {
    room: 'dnevna_soba',
    findings: [
      {
        item: 'parket',
        description: 'Nova ogrebotina dužine ~30cm ispod prozora',
        severity: 'minor',
        confidence: 0.85,
        wear_and_tear: false,
        location_in_image: 'donji levi deo slike'
      },
      {
        item: 'zid — jugozapadni',
        description: 'Blago izbledela boja oko mesta gde je stajala slika',
        severity: 'minor',
        confidence: 0.72,
        wear_and_tear: true,
        location_in_image: 'centralni deo slike'
      }
    ],
    summary: 'Jedna manja ogrebotina, jedno normalno habanje.',
    overall_condition: 'good'
  },
  'kupatilo': {
    room: 'kupatilo',
    findings: [
      {
        item: 'ogledalo iznad lavaboa',
        description: 'Pukotina u donjem desnom uglu ogledala',
        severity: 'major',
        confidence: 0.93,
        wear_and_tear: false,
        location_in_image: 'gornji desni deo slike'
      }
    ],
    summary: 'Puklo ogledalo — značajno oštećenje.',
    overall_condition: 'damaged'
  },
  'kuhinja': {
    room: 'kuhinja',
    findings: [],
    summary: 'Bez vidljivih promena.',
    overall_condition: 'excellent'
  },
  'spavaca_soba': {
    room: 'spavaca_soba',
    findings: [],
    summary: 'Bez vidljivih promena.',
    overall_condition: 'excellent'
  }
};
```

---

## 9. Rule Engine — Deterministička raspodela depozita

### 9.1 Fiksne vrednosti

| Severity | Odbitak po nalazu | Uslov |
|----------|-------------------|-------|
| `none` | 0% | — |
| `minor` | 3% depozita | samo ako `wear_and_tear: false` |
| `medium` | 10% depozita | samo ako `wear_and_tear: false` |
| `major` | 25% depozita | samo ako `wear_and_tear: false` |

### 9.2 Implementacija

```javascript
const DEDUCTION_RATES = {
  none: 0,
  minor: 0.03,    // 3%
  medium: 0.10,   // 10%
  major: 0.25     // 25%
};

const CONFIDENCE_THRESHOLD = 0.6;   // ispod ovoga → manual review
const MAX_AUTO_DEDUCTION = 0.50;    // preko 50% → manual review

function calculateSettlement(depositAmountEur, analysisResults) {
  const deductions = [];
  const skippedFindings = [];
  let totalDeductionEur = 0;
  let hasLowConfidence = false;

  for (const room of analysisResults) {
    for (const finding of room.findings) {

      // Pravilo 1: Normalno habanje = 0 odbitak
      if (finding.wear_and_tear) {
        skippedFindings.push({
          finding: `${finding.item} — ${room.room}`,
          description: finding.description,
          reason: 'Klasifikovano kao normalno habanje (wear & tear)'
        });
        continue;
      }

      // Pravilo 2: Nizak confidence → flaguj ali ne uračunavaj
      if (finding.confidence < CONFIDENCE_THRESHOLD) {
        hasLowConfidence = true;
        skippedFindings.push({
          finding: `${finding.item} — ${room.room}`,
          description: finding.description,
          reason: `Nizak confidence (${(finding.confidence * 100).toFixed(0)}%) — potrebna ručna provera`
        });
        continue;
      }

      // Pravilo 3: Izračunaj odbitak
      const rate = DEDUCTION_RATES[finding.severity] || 0;
      const deductionEur = Math.round(depositAmountEur * rate * 100) / 100;

      if (deductionEur > 0) {
        deductions.push({
          finding: `${finding.item} — ${room.room}`,
          description: finding.description,
          severity: finding.severity,
          confidence: finding.confidence,
          deduction_eur: deductionEur,
          deduction_percent: rate * 100,
          reason: `${finding.severity} oštećenje — novo u odnosu na check-in`
        });
        totalDeductionEur += deductionEur;
      }
    }
  }

  // Pravilo 4: Cap na 100% depozita
  totalDeductionEur = Math.min(totalDeductionEur, depositAmountEur);

  // Pravilo 5: Ako ukupno > 50% → manual review
  const totalDeductionPercent = (totalDeductionEur / depositAmountEur) * 100;
  const requiresManualReview = totalDeductionPercent > 50 || hasLowConfidence;

  return {
    deposit_amount_eur: depositAmountEur,
    deductions,
    skipped_findings: skippedFindings,
    total_deduction_eur: Math.round(totalDeductionEur * 100) / 100,
    total_deduction_percent: Math.round(totalDeductionPercent * 100) / 100,
    tenant_receives_eur: Math.round((depositAmountEur - totalDeductionEur) * 100) / 100,
    landlord_receives_eur: Math.round(totalDeductionEur * 100) / 100,
    settlement_type: requiresManualReview ? 'manual_review' : 'automatic',
    requires_manual_review: requiresManualReview,
    explanation: generateExplanation(deductions, skippedFindings, totalDeductionEur, totalDeductionPercent, depositAmountEur)
  };
}

function generateExplanation(deductions, skipped, totalEur, totalPercent, depositEur) {
  if (deductions.length === 0) {
    return `Nema oštećenja — depozit od ${depositEur}€ se vraća u celosti stanaru.`;
  }
  const parts = deductions.map(d =>
    `${d.finding} (${d.severity}, -${d.deduction_eur}€)`
  );
  let text = `Zadržano ${totalPercent.toFixed(0)}% depozita (${totalEur}€) zbog: ${parts.join('; ')}.`;
  if (skipped.length > 0) {
    text += ` ${skipped.length} nalaz(a) preskočeno (normalno habanje ili nizak confidence).`;
  }
  return text;
}
```

### 9.3 Edge case testovi

```javascript
// Test 1: Nema oštećenja
// Input: findings = []
// Expected: tenant_receives = 100%, landlord_receives = 0%

// Test 2: Sve major
// Input: 5 × major findings (5 × 25% = 125%)
// Expected: cap na 100%, requires_manual_review = true (>50%)

// Test 3: Svi low confidence
// Input: 3 findings sa confidence 0.4
// Expected: svi preskočeni, tenant_receives = 100%, manual_review = true

// Test 4: Mix
// Input: 1 minor (0.85), 1 wear&tear, 1 major (0.93)
// Expected: minor=3% + major=25% = 28%, automatic

// Test 5: Tačno 50%
// Input: 2 × major (2 × 25% = 50%)
// Expected: 50%, automatic (>50% je trigger, ne >=50%)
```

---

## 10. Audit Trail — Hash Chain

### 10.1 Implementacija

```javascript
const crypto = require('crypto');

async function logAuditEvent(contractId, eventType, actorId, actorRole, data) {
  // 1. Pronađi poslednji event za ovaj ugovor
  const lastEvent = await db.query(
    `SELECT event_hash FROM audit_events 
     WHERE contract_id = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [contractId]
  );
  const previousHash = lastEvent.rows[0]?.event_hash || null;

  // 2. Kreiraj hash novog eventa (chain)
  const eventData = {
    contract_id: contractId,
    event_type: eventType,
    actor_id: actorId,
    data,
    previous_hash: previousHash,
    timestamp: new Date().toISOString()
  };
  const eventHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(eventData))
    .digest('hex');

  // 3. Upiši u bazu
  const result = await db.query(
    `INSERT INTO audit_events 
     (contract_id, event_type, actor_id, actor_role, data, event_hash, previous_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [contractId, eventType, actorId, actorRole, data, eventHash, previousHash]
  );

  return result.rows[0];
}

// Verifikacija integriteta chain-a
async function verifyAuditChain(contractId) {
  const events = await db.query(
    `SELECT * FROM audit_events 
     WHERE contract_id = $1 
     ORDER BY created_at ASC`,
    [contractId]
  );

  for (let i = 0; i < events.rows.length; i++) {
    const event = events.rows[i];

    // Proveri da li previous_hash odgovara
    if (i === 0 && event.previous_hash !== null) return false;
    if (i > 0 && event.previous_hash !== events.rows[i - 1].event_hash) return false;

    // Rekonstruiši hash i uporedi
    const reconstructed = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        contract_id: event.contract_id,
        event_type: event.event_type,
        actor_id: event.actor_id,
        data: event.data,
        previous_hash: event.previous_hash,
        timestamp: event.created_at.toISOString()
      }))
      .digest('hex');

    if (reconstructed !== event.event_hash) return false;
  }

  return true;
}
```

---

## 11. Smart Contract — Solana (Anchor framework)

### 11.1 Strategija

Solana se koristi za tri stvari:
1. **Nepromenljiv zapis** — hash ugovora, slika i settlement-a na chain-u
2. **Escrow depozita** — SOL zaključan u PDA (Program Derived Address)
3. **Automatska raspodela** — pri finalizaciji, PDA otpušta sredstva prema settlement procentima

Backend State Machine iz sekcije 4 ostaje PRIMARNI mehanizam upravljanja stanjima.
Solana je DODATNI verifikacioni layer. Ako Solana poziv ne uspe, backend nastavlja sa radom (graceful degradation).

### 11.2 Kada se Solana poziva (5 momenata)

| Momenat | Solana instrukcija | Kad se poziva | Šta se čuva |
|---------|-------------------|---------------|-------------|
| Kreiranje ugovora | `initialize()` | POST /contracts | Hash ugovora, iznos depozita |
| Stanar prihvata | `lock_deposit()` | POST /contracts/:id/accept | Stanar šalje SOL u PDA |
| Check-in odobren | `record_checkin()` | POST /checkin/approve | Hash svih check-in slika |
| Check-out odobren | `record_checkout()` | POST /checkout/approve | Hash svih check-out slika |
| Finalizacija | `execute_settlement()` | POST /settlement/approve (druga strana) | Hash settlement-a, raspodela escrow-a |

Sve između (odbijanja, ponovna slikanja, LLM analiza, rule engine) je OFF-CHAIN.

### 11.3 PDA (Program Derived Address)

PDA seed: `["rental", contract_id_as_bytes]`

PDA je deterministic — isti contract_id uvek daje istu adresu. Nema privatni ključ — samo program može da potpiše transakcije za taj PDA.

### 11.4 Anchor program (Rust)

\`\`\`rust
use anchor_lang::prelude::*;

declare_id!("PROGRAM_ID_OVDE");

#[program]
pub mod rentsmart {
use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        contract_id: [u8; 32],
        contract_hash: [u8; 32],
        deposit_lamports: u64,
    ) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        agreement.contract_id = contract_id;
        agreement.contract_hash = contract_hash;
        agreement.landlord = ctx.accounts.landlord.key();
        agreement.deposit_lamports = deposit_lamports;
        agreement.state = AgreementState::Created as u8;
        agreement.bump = ctx.bumps.agreement;
        Ok(())
    }

    pub fn lock_deposit(ctx: Context<LockDeposit>) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        require!(agreement.state == AgreementState::Created as u8, ErrorCode::InvalidStatus);

        // Transfer SOL from tenant to PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.tenant.key(),
            &ctx.accounts.agreement.key(),
            agreement.deposit_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.tenant.to_account_info(),
                ctx.accounts.agreement.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        agreement.tenant = ctx.accounts.tenant.key();
        agreement.state = AgreementState::DepositLocked as u8;
        Ok(())
    }

    pub fn record_checkin(
        ctx: Context<RecordCheckin>,
        image_hash: [u8; 32],
    ) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        agreement.checkin_hash = image_hash;
        agreement.state = AgreementState::CheckinRecorded as u8;
        Ok(())
    }

    pub fn record_checkout(
        ctx: Context<RecordCheckout>,
        image_hash: [u8; 32],
    ) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        agreement.checkout_hash = image_hash;
        agreement.state = AgreementState::CheckoutRecorded as u8;
        Ok(())
    }

    pub fn execute_settlement(
        ctx: Context<ExecuteSettlement>,
        settlement_hash: [u8; 32],
        tenant_amount: u64,
        landlord_amount: u64,
    ) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        agreement.settlement_hash = settlement_hash;
        agreement.state = AgreementState::Settled as u8;

        // Transfer SOL from PDA to tenant and landlord
        // (implementacija koristi PDA signer seeds za potpisivanje)

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AgreementState {
    Created = 0,
    DepositLocked = 1,
    CheckinRecorded = 2,
    CheckoutRecorded = 3,
    Settled = 4,
}

#[account]
pub struct RentalAgreement {
    pub contract_id: [u8; 32],       // UUID bez crtica (32 ASCII karaktera)
    pub contract_hash: [u8; 32],     // SHA-256 ugovora
    pub deposit_lamports: u64,
    pub landlord: Pubkey,
    pub tenant: Pubkey,
    pub state: AgreementState,
    pub checkin_hash: [u8; 32],
    pub checkout_hash: [u8; 32],
    pub settlement_hash: [u8; 32],
    pub bump: u8,
}
// SIZE = 256 bajta (8 discriminator + 248 data)
\`\`\`

### 11.5 Backend integracija (TypeScript — Anchor klijent)

\`\`\`typescript
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';

export class SolanaService {
  private connection: Connection;
  private authority: Keypair;
  private program: Program;

  findPDA(contractId: string): { pda: PublicKey; bump: number } {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('rental'), Buffer.from(contractId)],
      this.program.programId
    );
  }

  async initializeContract(
    contractId: string,
    contractHash: Buffer,
    depositLamports: number,
    landlordPubkey: string
  ): Promise<{ tx_signature: string; pda_address: string; explorer_url: string }> {
    const { pda } = this.findPDA(contractId);

    const tx = await this.program.methods
      .initialize(
        Buffer.from(contractId.replace(/-/g, '')),
        contractHash,
        new BN(depositLamports)
      )
      .accounts({ agreement: pda, landlord: new PublicKey(landlordPubkey) })
      .rpc();

    return {
      tx_signature: tx,
      pda_address: pda.toBase58(),
      explorer_url: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
    };
  }

  async buildLockDepositTx(contractId: string, tenantPubkey: string): Promise<{ serialized_tx: string }> { /* ... */ }

  async recordCheckin(contractId: string, imageHash: Buffer, landlordPubkey: string): Promise<{ tx_signature: string }> { /* ... */ }

  async recordCheckout(contractId: string, imageHash: Buffer, tenantPubkey: string): Promise<{ tx_signature: string }> { /* ... */ }

  async executeSettlement(
    contractId: string, settlementHash: Buffer,
    tenantAmount: number, landlordAmount: number,
    tenantPubkey: string, landlordPubkey: string
  ): Promise<{ tx_signature: string; explorer_url: string }> { /* ... */ }

  hashImages(imageHashes: string[]): Buffer { /* ... */ }

  eurToLamports(eurAmount: number): number { /* ... */ }
}
\`\`\`

**Pozivanje iz ostalih servisa — uvek sa try/catch:**
\`\`\`typescript
try {
  const solana = new SolanaService();
  const depositLamports = solana.eurToLamports(depositEur);
  const result = await solana.initializeContract(
    contract.id, contractHash, depositLamports, landlordPubkey
  );
  await db.query(
    'UPDATE contracts SET solana_pda = $1, solana_tx_init = $2 WHERE id = $3',
    [result.pda_address, result.tx_signature, contract.id]
  );
} catch (err) {
  console.warn(`Solana failed for contract ${contract.id}:`, err);
  // Nastavlja se — Solana je opcioni layer
}
\`\`\`
## 12. Mobilna aplikacija — Ekrani i navigacija

### 12.1 Navigacija (expo-router)

```
app/
├── (auth)/
│   ├── login.tsx            # Phone + OTP
│   └── register.tsx         # Ime + potvrda
├── (tabs)/
│   ├── _layout.tsx          # Tab navigator
│   ├── index.tsx            # Dashboard (lista ugovora)
│   ├── new-contract.tsx     # Forma za kreiranje ugovora
│   └── profile.tsx          # Profil korisnika
├── contract/
│   ├── [id]/
│   │   ├── index.tsx        # Detalji ugovora + sažetak
│   │   ├── checkin.tsx       # Kamera flow za check-in
│   │   ├── checkout.tsx      # Kamera flow za check-out
│   │   ├── review-images.tsx # Pregled slika za odobravanje
│   │   ├── settlement.tsx    # Settlement breakdown
│   │   └── audit.tsx         # Audit trail / timeline
├── invite/
│   └── [code].tsx           # Invite link handler
└── _layout.tsx              # Root layout
```

### 12.2 Ključni ekrani

**Dashboard (index.tsx):**
- Kartice za svaki ugovor sa statusom, adresom, iznosom
- Badge sa bojom statusa (zeleno=active, žuto=pending, crveno=rejected)
- FAB dugme "Novi ugovor" (za stanodavce)
- Pull-to-refresh

**Kreiranje ugovora (new-contract.tsx):**
- ScrollView forma sa poljima iz API sekcije 5.2
- Dodavanje prostorija (obavezne predodabrane + opcione)
- Preview plain language sažetka pre potvrde
- "Kreiraj i pošalji" → generiše invite link → share sheet

**Kamera ekran (checkin.tsx / checkout.tsx):**
- Fullscreen CameraView
- Overlay: naziv prostorije + brojač + progress
- Check-out: thumbnailovi check-in slika kao referenca na vrhu ekrana
- Preview posle svake slike: Ponovi / Napomena / Dalje
- Progress bar po prostoriji
- Upload sa progress bar-om na kraju

**Review slike (review-images.tsx):**
- Grid prikaz slika po prostoriji
- Swipe za pre/posle poređenje
- "Odobri sve" ili "Odbij" + tekst polje za komentar

**Settlement (settlement.tsx):**
- Ukupan depozit na vrhu
- Expandable kartice za svako oštećenje (boja po severity)
- Pre/posle slike za svako oštećenje
- Skipped findings (wear & tear)
- Progress bar: stanar ↔ stanodavac raspodela
- "Finalize Settlement" dugme

**Audit trail (audit.tsx):**
- Vertikalni stepper/timeline
- Ikonice i boje po event tipu
- Tap otvara detalje (hash, slike, JSON)
- "Chain valid ✓" indikator na vrhu

---

## 13. Raspored implementacije — 5 dana, 3 osobe

### Podela uloga

| Osoba | Uloga | Fokus |
|-------|-------|-------|
| **Osoba A** | Frontend (React Native) | Expo, ekrani, kamera, UX |
| **Osoba B** | Backend (Node.js) | API, baza, state machine, audit trail |
| **Osoba C** | AI / Blockchain | LLM integracija, rule engine, Solana Anchor |

---

### Dan 1: Fundament

**Osoba A (Frontend):**
- [ ] `npx create-expo-app rentsmart` + expo-router setup
- [ ] Instalacija: expo-camera, expo-location, react-native-paper, expo-image-manipulator
- [ ] Auth ekrani: login (phone input → OTP input → success)
- [ ] Tab navigacija: Dashboard | Novi ugovor | Profil
- [ ] Dashboard ekran (prazna lista sa placeholder karticama)
- [ ] Forma za kreiranje ugovora (ScrollView, sva polja)

**Osoba B (Backend):**
- [ ] Express server setup + middleware (cors, json, error handler)
- [ ] Supabase PostgreSQL konekcija (connection pool)
- [ ] Migracije: kreiranje svih tabela iz sekcije 3
- [ ] Firebase Admin SDK setup + auth middleware
- [ ] Mock auth fallback (env variable toggle)
- [ ] API: POST /auth/verify, GET /auth/me
- [ ] API: POST /contracts (kreiranje + invite kod + hash)
- [ ] API: GET /contracts (lista po korisniku)
- [ ] API: GET /contracts/:id
- [ ] API: GET /contracts/invite/:code
- [ ] API: POST /contracts/:id/accept
- [ ] State machine: transition validacija + actor validacija
- [ ] Audit trail logger: logAuditEvent() + hash chain

**Osoba C (AI/Blockchain):**
- [ ] Gemini API key setup + test poziv sa test slikama
- [ ] LLM servis: analyzeRoom() sa promptom iz sekcije 8.3
- [ ] LLM response parser sa error handling-om (sekcija 8.4)
- [ ] Mock response sistem (sekcija 8.5)
- [ ] Rule engine: calculateSettlement() (sekcija 9.2)
- [ ] Unit testovi za rule engine edge cases (sekcija 9.3)
- [ ] Plain language sažetak generator (template-based)
- [ ] Solana: Anchor project setup (`anchor init rentsmart`)
- [ ] Solana: RentalAgreement account struct + initialize instrukcija
- 
**Deliverable Dana 1:** Kreiranje ugovora + invite kod + auth + LLM test + rule engine.

---

### Dan 2: Kamera + Upload + LLM pipeline

**Osoba A (Frontend):**
- [ ] Invite ekran: pregled ugovora + "Prihvati" dugme
- [ ] Deep link / URL handler za invite kodove
- [ ] Kamera ekran: fullscreen CameraView sa overlay-em
- [ ] Izbor prostorije pre slikanja + progress bar
- [ ] Capture: slika + metadata (timestamp, GPS, device_id, hash)
- [ ] Preview posle svake slike: Ponovi / Napomena / Dalje
- [ ] Upload flow: progress bar → slanje na backend
- [ ] Check-in complete ekran

**Osoba B (Backend):**
- [ ] Supabase Storage setup (bucket, policies)
- [ ] API: POST /contracts/:id/checkin/start
- [ ] API: POST /contracts/:id/checkin/images (multipart upload + storage)
- [ ] API: POST /contracts/:id/checkin/complete
- [ ] Image metadata validacija (timestamp, GPS, device_id)
- [ ] API: GET /contracts/:id/checkin/images (za thumbnailove)
- [ ] API: POST /contracts/:id/checkout/* (isti pattern)
- [ ] API: POST /contracts/:id/checkin/approve i /reject
- [ ] API: POST /contracts/:id/checkout/approve i /reject
- [ ] State machine tranzicije za sve nove statuse

**Osoba C (AI/Blockchain):**
- [ ] API: POST /contracts/:id/analyze (orchestrator)
- [ ] Dohvatanje slika iz Supabase Storage → base64
- [ ] Uparivanje check-in/check-out slika po prostoriji
- [ ] Gemini API pozivi za svaku prostoriju (sequential)
- [ ] Rezultati → analysis_results tabela
- [ ] Settlement generator → settlements tabela
- [ ] Testiranje sa realnim slikama (uslikati sobu, pomeriti nešto)
- [ ] Iteracija na LLM promptu na osnovu rezultata

**Deliverable Dana 2:** Slikanje kamerom → upload → LLM analiza → settlement kalkulacija.

---

### Dan 3: Settlement + Review + Pipeline integracija

**Osoba A (Frontend):**
- [ ] Check-out kamera ekran sa referentnim thumbnailovima
- [ ] Review images ekran: grid + swipe + approve/reject
- [ ] Settlement ekran: breakdown, kartice, progress bar
- [ ] Expandable kartice za oštećenja sa pre/posle slikama
- [ ] "Finalize Settlement" dugme
- [ ] Loading/progress ekrani za LLM analizu
- [ ] Error handling UI: nema GPS-a, upload fail, API greška

**Osoba B (Backend):**
- [ ] API: GET /contracts/:id/analysis
- [ ] API: GET /contracts/:id/settlement
- [ ] API: POST /contracts/:id/settlement/approve
- [ ] Automatski trigger analize nakon checkout approve
- [ ] Settlement → completed tranzicija
- [ ] API: GET /contracts/:id/audit (timeline)
- [ ] Testiranje kompletnog flow-a end-to-end

**Osoba C (AI/Blockchain):**
- [ ] Anchor program: lock_deposit, record_checkin, record_checkout, execute_settlement
- [ ] Deploy na Solana Devnet (`anchor deploy --provider.cluster devnet`)
- [ ] @coral-xyz/anchor klijent u backend (SolanaService klasa)
- [ ] Integracija: initializeContract() + recordCheckin() sa try/catch
- [ ] Fino podešavanje LLM prompta
- [ ] Testiranje edge cases: sve OK / sve major / mix

**Deliverable Dana 3:** Kompletan flow od ugovora do settlement-a.

---

### Dan 4: Audit Trail + Polish + Bonus

**Osoba A (Frontend):**
- [ ] Audit trail / timeline ekran (vertikalni stepper)
- [ ] Tap na event → detalji modal
- [ ] Smart contract vizuelizacija (hash blokovi, tx hash-evi)
- [ ] UI polish: skeleton loading, haptic feedback, animacije
- [ ] Dashboard kartice sa real statusima i badge-evima
- [ ] Share invite link (native share sheet)
- [ ] Responsive layout provere

**Osoba B (Backend):**
- [ ] Chain verification endpoint
- [ ] Performance optimizacija (indeksi, connection pool)
- [ ] Rate limiting na API
- [ ] Error logging (structured, sa contract_id kontekstom)
- [ ] Health check endpoint
- [ ] CORS konfiguacija za produkciju
- [ ] Deploy na Railway/Render/Fly.io
- [ ] Zod šeme za sve preostale endpoint-e (ako nisu završene)
- [ ] Provera dependency pravila između modula (nema cirkularnih importa)

**Osoba C (AI/Blockchain):**
- [ ] Devnet demo podaci (kreiraj ugovor na chain-u, zaključaj escrow)
- [ ] Solana Explorer link generisanje (Devnet)
- [ ] LLM cost tracking (tokens, USD)
- [ ] Fallback mehanizam: ako Gemini padne → mock response
- [ ] Dokumentacija API-ja za tim

**Deliverable Dana 4:** Kompletna aplikacija sa svim ekranima + deploy.

---

### Dan 5: Testiranje + Demo priprema

**Svi zajedno:**
- [ ] End-to-end testiranje na 2+ fizička telefona
- [ ] Test scenario: uslikati prostoriju hakatona kao "stan"
- [ ] Pomeriti stolicu / zalepiti papir → check-out → analiza
- [ ] Verifikacija: LLM detektuje razlike? Rule engine logičan?
- [ ] Fix kritičnih bagova
- [ ] Priprema demo podataka (realni ugovori, iznosi)
- [ ] Priprema prezentacije (slajdovi)
- [ ] Vežbanje live demo-a na telefonu
- [ ] Snimanje backup screen recording-a
- [ ] Stress test: šta ako WiFi padne tokom demo-a?

**Deliverable Dana 5:** Spreman live demo + backup + prezentacija.

---

## 14. Environment varijable

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci...
DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres

# Firebase
FIREBASE_PROJECT_ID=rentsmart-xxx
FIREBASE_PRIVATE_KEY="-----BEGIN..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@rentsmart-xxx.iam.gserviceaccount.com

# Gemini
GEMINI_API_KEY=AIzaSy...

# Solana (opciono — graceful degradation ako nije konfigurisano)
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_AUTHORITY_KEYPAIR=[byte array JSON]
SOLANA_PROGRAM_ID=<program public key>

# App
NODE_ENV=production
PORT=3000
MOCK_AUTH=false
MOCK_LLM=false
```

---

## 15. Rizici i mitigation plan

| Rizik | Verovatnoća | Uticaj | Mitigation | Vlasnik |
|-------|-------------|--------|------------|---------|
| Firebase Phone Auth setup traje predugo | Srednja | Visok | Mock auth fallback (env toggle) | Osoba B |
| Gemini Vision ne vraća validan JSON | Srednja | Visok | Parser sa retry (3×) + mock response | Osoba C |
| Gemini API rate limit | Niska | Visok | Cache rezultate + mock za demo | Osoba C |
| Supabase Storage 1GB limit | Visoka | Srednji | Resize na 1920px (1 linija koda) | Osoba A |
| Kamera permisije ne rade na uređaju | Srednja | Visok | Testiranje na 2+ telefona od Dana 1 | Osoba A |
| GPS nedostupan u zatvorenom | Srednja | Srednji | Tolerancija ±500m za MVP | Osoba B |
| Spor internet tokom demo-a | Srednja | Visok | Pre-uploadovane demo slike + screen recording | Svi |
| Expo Go limitacije | Niska | Srednji | expo-camera i expo-location rade u Expo Go | Osoba A |
| Solana Anchor deploy ne uspe | Srednja | Nizak | Graceful degradation — backend nastavlja bez blockchain-a | Osoba C |
| Anchor klijent verzija mismatch | Srednja | Srednji | Pinovati @coral-xyz/anchor verziju u package.json | Osoba C |
| E2E flow puca na neočekivanom mestu | Visoka | Visok | Dan 5 je ceo posvećen testiranju | Svi |

---

## 16. Demo scenario (za prezentaciju)

1. **Otvorite sa problemom** — "Ana je platila 800€ depozita. Stanodavac je zadržao 300€ jer tvrdi da je parket oštećen. Ana ne može da dokaže suprotno. Nema slika, nema dokaza, nema transparentnosti."

2. **Stanodavac kreira ugovor** → pokazati formu → plain language sažetak

3. **Invite link** → stanodavac šalje → stanar otvara na svom telefonu → prihvata

4. **Check-in** → stanodavac otvara kameru → slika prostoriju hakatona kao "stan" → GPS ✓ timestamp ✓ → stanar odobrava na svom telefonu

5. **Simulacija prolaska vremena** → "Prošlo je 12 meseci..."

6. **Check-out** → stanar otvara kameru → vidi referentne slike → slika iste prostorije ALI: stolica je pomerena, čaša je ostavljena, papir zalepljen na zid

7. **LLM analiza** → "Pronađena 2 oštećenja: ogrebotina na parketu (minor, 85%), puklo ogledalo (major, 93%)"

8. **Rule engine** → "Zadržano 224€ (28%) — ogrebotina 24€ (3%) + ogledalo 200€ (25%). Normalno habanje: 0€."

9. **Settlement ekran** → transparentan breakdown sa pre/posle slikama

10. **Audit trail** → "Svaki korak je zapisan, hash-iran, verifikovan — ovo je jedinstven izvor istine"

11. **Blockchain** → "Hash ugovora i settlement-a je na Solana Devnet-u — pogledajte u Solana Explorer-u"

12. **Zaključak** — "Ana više ne mora da veruje Marku. Sistem garantuje fer ishod."

---

## 17. Post-MVP roadmap (van scope-a hakatona)

Sledeće funkcionalnosti su identifikovane ali **ne ulaze** u MVP:

1. Kompresija i optimizacija slika (resize, format, quality)
2. Offline kamera flow (lokalna queue + sync)
3. Push notifikacije (check-in approved, settlement ready)
4. Video snimanje i analiza
5. Dispute resolution sa ljudskim arbitrom
6. Integracija sa platnim sistemima (Stripe, banka)
7. Multi-property dashboard (SaaS za upravljanje)
8. GDPR compliance (enkripcija, pravo na brisanje)
9. Web verzija aplikacije
10. Mainnet deployment smart contract-a
11. White-label API za agencije
12. Napredni AI: procena troškova popravke, prediktivna analiza
