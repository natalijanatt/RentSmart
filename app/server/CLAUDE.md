# CLAUDE.md — RentSmart Server

## Šta je ovaj projekat

Backend API za RentSmart — mobilnu aplikaciju za transparentno upravljanje depozitima pri iznajmljivanju stanova. Sistem koristi LLM analizu slika (Gemini Vision) za objektivnu procenu štete, deterministički rule engine za raspodelu depozita, i Solana blockchain za escrow i nepromenljiv zapis.

Ovo je MVP za hakaton (5 dana, 3 osobe). Backend je Express.js server (TypeScript) koji služi React Native (Expo) mobilnu aplikaciju.

## Tech stack

- **Runtime:** Node.js + Express.js
- **Jezik:** TypeScript (strict mode)
- **Baza:** PostgreSQL na Supabase (direktni SQL upiti preko pg pool-a)
- **Storage:** Supabase Storage (slike stana — check-in/check-out)
- **Auth:** Firebase Admin SDK (phone + SMS OTP), sa mock fallback-om za development
- **LLM:** Google Gemini 1.5 Pro Vision API (analiza slika po prostorijama)
- **Blockchain:** Solana Devnet, Anchor framework, @coral-xyz/anchor klijent
- **Deploy:** Railway (automatski iz GitHub-a)

## Struktura

```
src/
├── index.ts                    # Express entry, middleware, route mounting
├── types/
│   ├── index.ts                # Svi domenski tipovi (Contract, Settlement, Finding...)
│   └── express.d.ts            # Extend Express Request sa user property-jem
├── middleware/
│   ├── auth.ts                 # Firebase token verifikacija + mock auth
│   ├── errorHandler.ts         # Centralni error handler + asyncHandler wrapper
│   └── validate.ts             # Request body validacija
├── routes/
│   ├── auth.ts                 # POST /auth/verify, GET /auth/me
│   ├── contracts.ts            # CRUD ugovora, invite, accept
│   ├── inspections.ts          # Check-in/check-out: start, images, complete, approve, reject
│   ├── analysis.ts             # LLM analiza, settlement, finalize
│   └── audit.ts                # Audit trail timeline
├── services/
│   ├── contractManager.ts      # State machine tranzicije + CRUD
│   ├── imageService.ts         # Upload/download slika iz Supabase Storage
│   ├── llmService.ts           # Gemini Vision API pozivi + parsiranje + mock
│   ├── ruleEngine.ts           # Deterministička raspodela depozita
│   ├── auditTrail.ts           # Hash chain logger (SHA-256)
│   ├── solana/
│   │   ├── ISolanaService.ts   # Interfejs (kopija iz app/blockchain/client/src/interface.ts)
│   │   ├── MockSolanaService.ts# Mock implementacija za development bez blockchain-a
│   │   └── index.ts            # Factory: createSolanaService() → real ili mock
│   └── inviteService.ts        # Generisanje invite kodova
├── db/
│   ├── client.ts               # Supabase klijent + pg Pool
│   └── migrations/
│       └── 001_initial.sql     # Kompletna šema (7 tabela)
├── config/
│   └── stateMachine.ts         # STATE_TRANSITIONS + TRANSITION_ACTORS mape
└── utils/
    ├── hash.ts                 # SHA-256 helperi
    └── geo.ts                  # Haversine distance (GPS validacija)

tsconfig.json
package.json
.env.example
```

## Pokretanje

```bash
cp .env.example .env   # popuni vrednosti
npm install
npm run dev            # tsx watch src/index.ts, port 3000
npm run build          # tsc → dist/
npm run start          # node dist/index.js (produkcija)
```

Health check: GET /health → {"status":"ok"}

### package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Ključne dev zavisnosti

```bash
npm install -D typescript tsx @types/node @types/express @types/cors @types/morgan @types/multer @types/pg @types/uuid
```

tsx se koristi za development (zamena za ts-node + nodemon, brži i bez konfiguracije). Za produkciju se kompajlira sa tsc i pokreće sa node.

## Env varijable

```
SUPABASE_URL           # https://xxxxx.supabase.co
SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY   # za server-side operacije (Storage, admin)
DATABASE_URL           # postgresql://... connection string

FIREBASE_PROJECT_ID
FIREBASE_PRIVATE_KEY   # sa \n escape-ovima
FIREBASE_CLIENT_EMAIL

GEMINI_API_KEY

SOLANA_RPC_URL         # https://api.devnet.solana.com
SOLANA_AUTHORITY_KEYPAIR  # JSON array byte-ova
SOLANA_PROGRAM_ID

PORT                   # default 3000
NODE_ENV               # development | production
MOCK_AUTH              # true = koristi X-Mock-User header umesto Firebase-a
MOCK_LLM              # true = koristi hardkodirane LLM odgovore
```

## Tipovi (src/types/index.ts)

Svi domenski tipovi su definisani na jednom mestu. Importovati odatle, ne redefinisati.

```typescript
export type ContractStatus =
  | 'draft' | 'pending_acceptance' | 'accepted'
  | 'checkin_in_progress' | 'checkin_pending_approval' | 'checkin_rejected'
  | 'active'
  | 'checkout_in_progress' | 'checkout_pending_approval' | 'checkout_rejected'
  | 'pending_analysis' | 'settlement' | 'completed' | 'cancelled';

export type RoomType =
  | 'kuhinja' | 'kupatilo' | 'dnevna_soba' | 'spavaca_soba'
  | 'hodnik' | 'balkon' | 'ostava' | 'terasa' | 'garaza' | 'druga';

export type Severity = 'none' | 'minor' | 'medium' | 'major';
export type InspectionType = 'checkin' | 'checkout';
export type SettlementType = 'automatic' | 'manual_review';
export type ActorRole = 'landlord' | 'tenant' | 'system' | 'both';

export interface User {
  id: string;
  phone: string;
  display_name: string;
  firebase_uid: string;
  device_id: string | null;
  solana_pubkey: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Contract {
  id: string;
  landlord_id: string;
  tenant_id: string | null;
  invite_code: string;
  property_address: string;
  property_gps_lat: number | null;
  property_gps_lng: number | null;
  rent_monthly_eur: number;
  deposit_amount_eur: number;
  start_date: string;
  end_date: string;
  deposit_rules: string | null;
  notes: string | null;
  plain_language_summary: string | null;
  status: ContractStatus;
  deposit_status: string;
  contract_hash: string | null;
  rejection_comment: string | null;
  solana_pda: string | null;
  solana_tx_init: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Finding {
  item: string;
  description: string;
  severity: Severity;
  confidence: number;
  wear_and_tear: boolean;
  location_in_image: string;
}

export interface RoomAnalysis {
  room: string;
  findings: Finding[];
  summary: string;
  overall_condition: 'excellent' | 'good' | 'fair' | 'damaged' | 'unknown';
  parse_error?: boolean;
  raw_response?: string;
}

export interface Deduction {
  finding: string;
  description: string;
  severity: Severity;
  confidence: number;
  deduction_eur: number;
  deduction_percent: number;
  reason: string;
}

export interface SkippedFinding {
  finding: string;
  description: string;
  reason: string;
}

export interface SettlementResult {
  deposit_amount_eur: number;
  deductions: Deduction[];
  skipped_findings: SkippedFinding[];
  total_deduction_eur: number;
  total_deduction_percent: number;
  tenant_receives_eur: number;
  landlord_receives_eur: number;
  settlement_type: SettlementType;
  requires_manual_review: boolean;
}

export interface AuditEvent {
  id: string;
  contract_id: string;
  event_type: AuditEventType;
  actor_id: string | null;
  actor_role: string | null;
  data: Record<string, unknown>;
  event_hash: string;
  previous_hash: string | null;
  created_at: Date;
}

export type AuditEventType =
  | 'CONTRACT_CREATED' | 'INVITE_SENT' | 'CONTRACT_ACCEPTED'
  | 'DEPOSIT_LOCKED'
  | 'CHECKIN_STARTED' | 'CHECKIN_IMAGE_CAPTURED' | 'CHECKIN_COMPLETED'
  | 'CHECKIN_APPROVED' | 'CHECKIN_REJECTED'
  | 'CHECKOUT_STARTED' | 'CHECKOUT_IMAGE_CAPTURED' | 'CHECKOUT_COMPLETED'
  | 'CHECKOUT_APPROVED' | 'CHECKOUT_REJECTED'
  | 'LLM_ANALYSIS_STARTED' | 'LLM_ANALYSIS_COMPLETED'
  | 'RULE_ENGINE_EXECUTED' | 'SETTLEMENT_PROPOSED'
  | 'SETTLEMENT_VIEWED' | 'SETTLEMENT_FINALIZED'
  | 'DEPOSIT_RELEASED' | 'CONTRACT_HASH_STORED' | 'CONTRACT_CANCELLED';

export interface ImageMetadata {
  captured_at: string;
  gps_lat: number;
  gps_lng: number;
  device_id: string;
  image_hash: string;
  note?: string;
}
```

### Express Request extension (src/types/express.d.ts)

```typescript
import { User } from './index';

declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}
```

## Baza podataka

PostgreSQL na Supabase. Sedam tabela: users, contracts, rooms, inspection_images, analysis_results, settlements, audit_events.

Koristimo direktne SQL upite preko pg Pool-a (db.query()), NE Supabase JS klijent za čitanje/pisanje podataka. Supabase klijent koristimo samo za Storage (upload/download slika).

### Ključni tipovi (PostgreSQL ENUM-ovi)

**contract_status:** draft → pending_acceptance → accepted → checkin_in_progress → checkin_pending_approval → (checkin_rejected ↩) → active → checkout_in_progress → checkout_pending_approval → (checkout_rejected ↩) → pending_analysis → settlement → completed

**inspection_type:** checkin, checkout

**room_type:** kuhinja, kupatilo, dnevna_soba, spavaca_soba, hodnik, balkon, ostava, terasa, garaza, druga

**settlement_type:** automatic, manual_review

### Konvencije za upite

```typescript
import { db } from '../db/client';
import type { Contract } from '../types';

// SELECT — uvek prosleđuj generički tip
const result = await db.query<Contract>('SELECT * FROM contracts WHERE id = $1', [id]);
const contract = result.rows[0]; // tip: Contract

// INSERT sa RETURNING
const result = await db.query<Contract>(
  'INSERT INTO contracts (id, landlord_id, ...) VALUES ($1, $2, ...) RETURNING *',
  [id, landlordId]
);

// UPDATE
await db.query(
  'UPDATE contracts SET status = $1, updated_at = NOW() WHERE id = $2',
  [newStatus, id]
);
```

Uvek koristi parameterizovane upite ($1, $2...). Nikad string interpolacija u SQL-u.

## API konvencije

Base path: /api/v1

Svi endpoint-i osim /auth/* i /contracts/invite/:code zahtevaju auth middleware. Autentifikovani korisnik je dostupan kao req.user (tip: User).

### Rute

```
Auth:
  POST   /auth/verify                    # Firebase token → session
  GET    /auth/me                        # Profil korisnika

Contracts:
  POST   /contracts                      # Kreiranje (landlord)
  GET    /contracts                      # Lista mojih ugovora
  GET    /contracts/:id                  # Detalji + rooms
  GET    /contracts/invite/:code         # Preview pre prihvatanja (bez auth-a)
  POST   /contracts/:id/accept           # Prihvatanje (tenant)
  POST   /contracts/:id/cancel           # Otkazivanje

Inspections:
  POST   /contracts/:id/checkin/start    # Započni check-in (landlord)
  POST   /contracts/:id/checkin/images   # Upload slika (multipart/form-data)
  POST   /contracts/:id/checkin/complete # Završi check-in
  POST   /contracts/:id/checkin/approve  # Stanar odobrava
  POST   /contracts/:id/checkin/reject   # Stanar odbija (body: { comment })
  GET    /contracts/:id/checkin/images   # Dohvati slike (thumbnailovi za check-out)
  POST   /contracts/:id/checkout/start
  POST   /contracts/:id/checkout/images
  POST   /contracts/:id/checkout/complete
  POST   /contracts/:id/checkout/approve
  POST   /contracts/:id/checkout/reject

Analysis:
  POST   /contracts/:id/analyze          # Pokreni LLM (automatski nakon checkout approve)
  GET    /contracts/:id/analysis         # Rezultati po prostoriji
  GET    /contracts/:id/settlement       # Settlement breakdown
  POST   /contracts/:id/finalize         # Finalizacija

Audit:
  GET    /contracts/:id/audit            # Timeline svih evenata
```

### Response format

Uspešan odgovor:
```json
{ "contract": { ... } }
{ "contracts": [ ... ] }
{ "settlement": { ... } }
{ "events": [ ... ], "chain_valid": true }
```

Greška:
```json
{ "error": "Opis greške" }
```

### Route handler pattern

```typescript
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/:id/checkin/start', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const contractId = req.params.id;
  const user = req.user; // tip: User
  // ... logika
  res.json({ status: 'checkin_in_progress' });
}));

export default router;
```

## State machine

Ugovor prolazi kroz 14 statusa. Svaka tranzicija se validira u config/stateMachine.ts.

Dozvoljene tranzicije i ko ih pokreće:

```
draft → pending_acceptance                    landlord (šalje invite)
pending_acceptance → accepted                 tenant (prihvata)
accepted → checkin_in_progress                landlord (pokreće check-in)
checkin_in_progress → checkin_pending_approval landlord (završava slikanje)
checkin_pending_approval → active             tenant (odobrava slike)
checkin_pending_approval → checkin_rejected   tenant (odbija slike)
checkin_rejected → checkin_in_progress        landlord (ponovo slika)
active → checkout_in_progress                 tenant (pokreće check-out)
checkout_in_progress → checkout_pending_approval tenant
checkout_pending_approval → pending_analysis  landlord (odobrava slike)
checkout_pending_approval → checkout_rejected landlord (odbija slike)
checkout_rejected → checkout_in_progress      tenant (ponovo slika)
pending_analysis → settlement                 system (LLM + rule engine)
settlement → completed                       both (finalizacija)
```

```typescript
import type { ContractStatus, ActorRole } from '../types';

export const STATE_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft:                      ['pending_acceptance', 'cancelled'],
  pending_acceptance:         ['accepted', 'cancelled'],
  accepted:                   ['checkin_in_progress', 'cancelled'],
  checkin_in_progress:        ['checkin_pending_approval'],
  checkin_pending_approval:   ['active', 'checkin_rejected'],
  checkin_rejected:           ['checkin_in_progress'],
  active:                     ['checkout_in_progress'],
  checkout_in_progress:       ['checkout_pending_approval'],
  checkout_pending_approval:  ['pending_analysis', 'checkout_rejected'],
  checkout_rejected:          ['checkout_in_progress'],
  pending_analysis:           ['settlement'],
  settlement:                 ['completed'],
  completed:                  [],
  cancelled:                  [],
};

export function validateTransition(
  currentStatus: ContractStatus,
  newStatus: ContractStatus,
  actorRole: ActorRole
): { valid: boolean; error?: string } {
  // ...
}
```

Kad menjaš status ugovora, uvek koristi validateTransition() pre UPDATE-a. Nikad direktno UPDATE contracts SET status bez validacije.

## Ko slika šta

- **Check-in:** stanodavac (landlord) slika stan pre useljenja
- **Check-out:** stanar (tenant) slika stan pre iseljenja
- Druga strana mora da odobri slike pre nastavka
- Odbijanje sadrži komentar — strana koja je slikala može ponovo da slika

## Auth

Dva moda, kontrolisana env varijablom MOCK_AUTH:

**Mock mod** (MOCK_AUTH=true): klijent šalje X-Mock-User: landlord_marko ili X-Mock-User: tenant_ana header. Dva predefinisana korisnika. Koristi za development i testiranje.

**Firebase mod** (MOCK_AUTH=false): klijent šalje Authorization: Bearer <firebase_id_token>. Backend verifikuje token sa Firebase Admin SDK i mapira na korisnika u users tabeli.

req.user je uvek tipa User (iz src/types/index.ts).

## LLM servis (llmService.ts)

Koristi Gemini 1.5 Pro Vision. Šalje parove check-in/check-out slika po prostoriji (ne sve odjednom).

Za jednu prostoriju: 3-10 BEFORE slika + 3-10 AFTER slika + prompt → JSON odgovor sa findings.

### Potpis funkcije

```typescript
export async function analyzeRoom(
  roomName: string,
  checkinImageBuffers: Buffer[],
  checkoutImageBuffers: Buffer[]
): Promise<RoomAnalysis>
```

### LLM izlaz — format

```json
{
  "room": "kuhinja",
  "findings": [
    {
      "item": "parket",
      "description": "Nova ogrebotina dužine ~30cm",
      "severity": "minor",
      "confidence": 0.85,
      "wear_and_tear": false,
      "location_in_image": "donji levi deo"
    }
  ],
  "summary": "Jedna manja ogrebotina.",
  "overall_condition": "good"
}
```

severity je tip Severity: 'none' | 'minor' | 'medium' | 'major'
confidence je float 0.0–1.0
wear_and_tear true = normalno habanje, ne naplaćuje se

### Parsiranje

LLM može da vrati broken JSON ili markdown-wrapped JSON. parseResponse() u llmService.ts čisti markdown fences, pokušava parsiranje, pa regex ekstrakciju, pa fallback objekat sa parse_error: true.

### Mock mod

Kad je MOCK_LLM=true, analyzeRoom() vraća hardkodirani odgovor po prostoriji (kuhinja=čisto, kupatilo=puklo ogledalo, dnevna_soba=ogrebotina+habanje, spavaća=čisto). Koristi za demo kad Gemini API ne radi.

## Rule engine (ruleEngine.ts)

Deterministički — isti input uvek daje isti output. Nema AI, nema subjektivnosti.

### Potpis

```typescript
export function calculateSettlement(
  depositAmountEur: number,
  analysisResults: RoomAnalysis[]
): SettlementResult
```

### Fiksne stope

```typescript
export const DEDUCTION_RATES: Record<Severity, number> = {
  none:   0,
  minor:  0.03,   // 3%
  medium: 0.10,   // 10%
  major:  0.25,   // 25%
};

export const CONFIDENCE_THRESHOLD = 0.6;
```

### Pravila

1. wear_and_tear: true → 0% odbitak (normalno habanje se ne naplaćuje)
2. confidence < 0.6 → nalaz se preskače, ide na manual review flag
3. Ukupni odbitak nikad ne prelazi 100% depozita
4. Ako ukupni odbitak > 50% → requires_manual_review: true
5. Ako postoji bilo koji low confidence nalaz → requires_manual_review: true

### Izlaz (tip: SettlementResult)

```json
{
  "deposit_amount_eur": 800,
  "deductions": [],
  "skipped_findings": [],
  "total_deduction_eur": 184,
  "total_deduction_percent": 23,
  "tenant_receives_eur": 616,
  "landlord_receives_eur": 184,
  "settlement_type": "automatic",
  "requires_manual_review": false
}
```

## Audit trail (auditTrail.ts)

Svaki značajan event se loguje u audit_events tabelu sa hash chain-om.

### Potpisi

```typescript
export async function logAuditEvent(
  contractId: string,
  eventType: AuditEventType,
  actorId: string | null,
  actorRole: ActorRole,
  data: Record<string, unknown>
): Promise<AuditEvent>

export async function verifyAuditChain(contractId: string): Promise<boolean>
```

Svaki event sadrži:
- event_hash: SHA-256(contract_id + event_type + actor_id + data + previous_hash + timestamp)
- previous_hash: hash prethodnog eventa za isti ugovor

Ovo formira chain of trust — ako se bilo koji event retroaktivno promeni, hash chain se lomi i verifyAuditChain() vraća false.

### Event tipovi (tip: AuditEventType)

CONTRACT_CREATED, INVITE_SENT, CONTRACT_ACCEPTED, DEPOSIT_LOCKED, CHECKIN_STARTED, CHECKIN_IMAGE_CAPTURED, CHECKIN_COMPLETED, CHECKIN_APPROVED, CHECKIN_REJECTED, CHECKOUT_STARTED, CHECKOUT_IMAGE_CAPTURED, CHECKOUT_COMPLETED, CHECKOUT_APPROVED, CHECKOUT_REJECTED, LLM_ANALYSIS_STARTED, LLM_ANALYSIS_COMPLETED, RULE_ENGINE_EXECUTED, SETTLEMENT_PROPOSED, SETTLEMENT_VIEWED, SETTLEMENT_FINALIZED, DEPOSIT_RELEASED, CONTRACT_HASH_STORED, CONTRACT_CANCELLED

## Solana integracija (services/solana/)

### Arhitektura odvajanja

Blockchain kod je u **posebnom modulu** (`app/blockchain/`) koji se razvija nezavisno od servera. Server i blockchain tim mogu raditi paralelno bez konflikata.

```
app/
├── server/          ← ovaj modul (server tim)
│   └── src/services/solana/
│       ├── ISolanaService.ts    # Interfejs (kopija iz blockchain modula)
│       ├── MockSolanaService.ts # Mock za development
│       └── index.ts             # Factory — bira real vs mock automatski
└── blockchain/      ← poseban modul (blockchain tim)
    └── client/src/
        ├── interface.ts         # IZVOR ISTINE za interfejs
        └── solanaService.ts     # Prava implementacija
```

**Korišćenje u route handleru:**
```typescript
import { createSolanaService } from '../services/solana';

// Kreira se jednom pri startu aplikacije
const solana = createSolanaService();

// Poziv u route-u — uvijek try/catch jer je blockchain bonus layer
let solanaTx: string | null = null;
try {
  const result = await solana.initializeContract(contractId, contractHash, depositLamports, landlordWallet);
  solanaTx = result.tx_signature;
} catch (err) {
  console.error('[Solana] initializeContract failed, continuing:', err);
}
```

**Automatski odabir implementacije:**
- `SOLANA_PROGRAM_ID` nije setovan → koristi `MockSolanaService` (log: `[MockSolana] ...`)
- `SOLANA_PROGRAM_ID` je setovan + `@rentsmart/blockchain` je instaliran → koristi pravu `SolanaService` (log: `[Solana] ...`)

**Integracija (kad blockchain tim završi):**
1. `npm install` u root direktorijumu (npm workspaces linkuje `@rentsmart/blockchain`)
2. Postavi `SOLANA_PROGRAM_ID`, `SOLANA_RPC_URL`, `SOLANA_AUTHORITY_KEYPAIR` u `.env`
3. Restart servera — factory automatski preuzima pravu implementaciju

Za detalje blockchain razvoja vidi: `app/blockchain/CLAUDE.md`

### Originalna specifikacija (solanaService.ts)

Solana se koristi za tri stvari: nepromenljiv zapis hash-a ugovora, escrow depozita u PDA, i automatsku raspodelu pri settlement-u.

Backend poziva Solana program na 5 ključnih momenata:

| Momenat | Solana instrukcija | Kad se poziva |
|---------|-------------------|---------------|
| Kreiranje ugovora | initialize() | POST /contracts |
| Stanar prihvata | lock_deposit() | POST /contracts/:id/accept |
| Check-in odobren | record_checkin() | POST /contracts/:id/checkin/approve |
| Check-out odobren | record_checkout() | POST /contracts/:id/checkout/approve |
| Finalizacija | execute_settlement() | POST /contracts/:id/finalize |

Sve između (odbijanja, ponovna slikanja, LLM analiza) je off-chain — samo PostgreSQL + audit trail.

PDA seed: ["rental", contract_id_as_bytes]

Ako Solana poziv ne uspe, backend treba da nastavi sa radom (graceful degradation) — Solana je bonus layer za dokaz, ne kritični put.

### Klasa

```typescript
export class SolanaService {
  constructor();
  findPDA(contractId: string): { pda: PublicKey; bump: number };
  async initializeContract(contractId: string, contractHash: Buffer, depositLamports: number, landlordPubkey: string): Promise<{ tx_signature: string; pda_address: string; explorer_url: string }>;
  async buildLockDepositTx(contractId: string, tenantPubkey: string): Promise<{ serialized_tx: string }>;
  async recordCheckin(contractId: string, imageHash: Buffer, landlordPubkey: string): Promise<{ tx_signature: string }>;
  async recordCheckout(contractId: string, imageHash: Buffer, tenantPubkey: string): Promise<{ tx_signature: string }>;
  async executeSettlement(contractId: string, settlementHash: Buffer, tenantAmount: number, landlordAmount: number, tenantPubkey: string, landlordPubkey: string): Promise<{ tx_signature: string; explorer_url: string }>;
  async getAgreement(contractId: string): Promise<SolanaAgreement | null>;
  static hashImages(imageHashes: string[]): Buffer;
  static eurToLamports(eurAmount: number): number;
}
```

## Image upload flow

Slike se uploaduju kao multipart/form-data na /contracts/:id/checkin/images (ili checkout).

Za svaku sliku, mobilna aplikacija šalje:
- images[]: File (JPEG)
- room_id: UUID prostorije
- captured_at[]: ISO timestamp po slici
- gps_lat, gps_lng: GPS koordinate
- device_id: identifikator uređaja
- notes[]: opciona napomena po slici

### Backend validacija metadata

Svaka slika se validira:
1. Timestamp: unutar ±1h od serverskog vremena
2. GPS: unutar 200m od adrese stana iz ugovora (haversine distance)
3. Device ID: konzistentan tokom cele inspekcije

### Supabase Storage putanja

```
rentsmart-images/{contract_id}/{checkin|checkout}/{room_type}/img_{index}_{hash}.jpg
```

## Invite sistem

Stanodavac kreira ugovor → sistem generiše invite kod (format: RS- + 6 alfanumeričkih karaktera). Charset bez sličnih karaktera (nema 0/O, 1/I/L): ABCDEFGHJKMNPQRSTUVWXYZ23456789.

Invite link: rentsmart://invite/RS-A7X2K9

Endpoint GET /contracts/invite/:code je javno dostupan (bez auth-a) — stanar pregleda uslove pre prihvatanja.

## Konvencije za kod

- Jezik komentara u kodu: engleski
- TypeScript strict mode — ne koristiti any osim za sirovi LLM response gde koristi unknown pa type guard
- ES module sintaksa: import/export, ne require()
- tsconfig.json sa "module": "commonjs" za kompatibilnost sa Node.js ekosistemom
- Async/await svuda, nikad callback-ovi
- Svaki servis exportuje tipizirane funkcije ili klasu
- Route fajlovi ne sadrže biznis logiku — delegiraju na servise
- Greške se bacaju sa throw new Error() i hvataju u asyncHandler
- UUID za sve ID-jeve (gen_random_uuid() u bazi, uuid paket u kodu)
- Decimalni iznosi (EUR) se čuvaju kao DECIMAL(10,2) u bazi, a u TypeScript-u kao number
- Svi timestampovi su TIMESTAMPTZ (UTC) u bazi, Date ili ISO string u kodu
- Tipovi za DB rezultate: uvek prosleđuj generički tip u db.query<T>()
- Tipovi se ne dupliraju — svi žive u src/types/index.ts

## Česte greške koje treba izbegavati

1. Ne menjaj status ugovora bez validacije. Uvek koristi validateTransition() pre UPDATE-a.
2. Ne zaboravi audit event. Svaka promena statusa mora imati odgovarajući audit log.
3. Ne šalji sve slike u jedan LLM poziv. Parovi po prostoriji — inače hit-uješ token limit.
4. Ne veruj LLM output-u. Uvek parsiraj, validiraj severity enum, clamp-uj confidence na 0-1.
5. Ne stavljaj lične podatke na Solanu. Samo hash-evi, iznosi, wallet adrese.
6. Ne koristi Supabase JS klijent za SQL upite. Koristi pg Pool direktno — brže i fleksibilnije.
7. Ne zaboravi ON DELETE CASCADE relacije. Brisanje ugovora mora da obriše slike, analize, settlement, audit.
8. Ne koristi any. Definiši tip ili koristi unknown pa type guard. Izuzetak: JSON.parse() rezultat — koristi unknown pa validiraj.
9. Ne zaboravi @types/* pakete. @types/express, @types/pg, @types/multer, @types/uuid itd.
10. Ne miksuj import i require. Koristi import svuda. esModuleInterop: true u tsconfig-u omogućava import CommonJS modula.

## Testiranje

```bash
# Health check
curl http://localhost:3000/health

# Kreiranje ugovora (mock auth)
curl -X POST http://localhost:3000/api/v1/contracts \
  -H "X-Mock-User: landlord_marko" \
  -H "Content-Type: application/json" \
  -d '{"property_address":"Test 1","rent_monthly_eur":400,"deposit_amount_eur":800,"start_date":"2026-04-01","end_date":"2027-04-01","rooms":[{"room_type":"kuhinja","is_mandatory":true}]}'

# Lista ugovora
curl http://localhost:3000/api/v1/contracts \
  -H "X-Mock-User: landlord_marko"

# Rule engine test
npx tsx -e "
  import { calculateSettlement } from './src/services/ruleEngine';
  console.log(JSON.stringify(calculateSettlement(800, [
    {room:'kupatilo', findings:[
      {item:'ogledalo', description:'Puklo', severity:'major', confidence:0.93, wear_and_tear:false, location_in_image:'gore'}
    ], summary:'Puklo.', overall_condition:'damaged'},
    {room:'dnevna_soba', findings:[
      {item:'parket', description:'Ogrebotina', severity:'minor', confidence:0.85, wear_and_tear:false, location_in_image:'dole'},
      {item:'zid', description:'Izbledelo', severity:'minor', confidence:0.72, wear_and_tear:true, location_in_image:'centar'}
    ], summary:'Ogrebotina+habanje.', overall_condition:'good'}
  ]), null, 2));
"
# Očekivano: tenant=616€, landlord=184€, automatic, zid preskočen (wear&tear)
```

## Deploy (Railway)

```bash
# Opcija 1: GitHub integracija (preporučeno)
# Poveži GitHub repo u Railway dashboard → automatski deploy na push

# Opcija 2: CLI
npm install -g @railway/cli
railway login
railway init
railway up
```

Railway koristi package.json scripts. Env varijable se dodaju u Railway dashboard.

Build komanda: npm run build (tsc kompajlira u dist/)
Start komanda: node dist/index.js