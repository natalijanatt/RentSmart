# CLAUDE.md — RentSmart Server

## What this is

Backend API for RentSmart — a mobile app for transparent rental deposit management. Express.js + TypeScript server serving a React Native (Expo) mobile app. MVP for a 5-day hackathon, team of 3.

Core flow: landlord creates contract → tenant accepts via invite link → landlord photographs apartment (check-in) → tenant confirms → tenant photographs at move-out (check-out) → landlord confirms → LLM compares before/after images → rule engine calculates deposit split → settlement finalized.

## Tech stack

- **Runtime:** Node.js + Express.js (TypeScript strict mode)
- **DB:** PostgreSQL on Supabase — direct SQL via pg Pool. NEVER use Supabase JS client for queries.
- **Storage:** Supabase Storage — images only. Use @supabase/supabase-js for upload/download.
- **Auth:** Firebase Admin SDK (phone + SMS OTP). Mock fallback for dev (MOCK_AUTH=true).
- **LLM:** Google Gemini 1.5 Pro Vision (@google/generative-ai). Mock fallback (MOCK_LLM=true).
- **Blockchain:** Solana Devnet, Anchor framework, @coral-xyz/anchor client.
- **Validation:** Zod for all request bodies and env vars.
- **Deploy:** Railway (auto-deploy from GitHub).

## Project structure

```
src/
├── index.ts                    # Entry: import app, listen on PORT
├── app.ts                      # Express setup: middleware chain, mount routers
├── modules/
│   ├── auth/                   # Firebase verify, user upsert
│   ├── contracts/              # CRUD, state machine, invite codes
│   ├── inspections/            # Check-in/out image upload, approval flow
│   ├── analysis/               # LLM + rule engine + settlement
│   ├── audit/                  # Hash chain event log
│   └── blockchain/             # Solana Anchor client
├── shared/
│   ├── types/index.ts          # ALL types — single source of truth
│   ├── types/express.d.ts      # Augment Request with user
│   ├── middleware/auth.ts      # Firebase verify + mock
│   ├── middleware/errorHandler.ts
│   ├── middleware/validate.ts  # Zod middleware
│   ├── db/client.ts            # pg Pool + Supabase client
│   ├── db/migrations/001_initial.sql
│   └── utils/                  # hash, geo, errors
└── config/env.ts               # Zod-validated env vars
```

Each module has: `{name}.routes.ts`, `{name}.service.ts`, `{name}.schema.ts`. Some have additional service files (e.g., `llmService.ts`, `ruleEngine.ts`).

## Commands

```bash
npm run dev        # tsx watch src/index.ts
npm run build      # tsc → dist/
npm run start      # node dist/index.js
```

## RULES — read these before writing any code

### Architecture rules

- EVERY module follows the pattern: routes → service → DB. Routes NEVER contain business logic.
- NEVER import from one module's internals into another. Use the module's service as the public API.
- Allowed dependency direction: auth → shared. contracts → shared + audit. inspections → shared + audit + contracts. analysis → shared + audit + contracts + inspections. audit → shared only. blockchain → shared only.
- NEVER create circular dependencies between modules.
- ALL types live in `shared/types/index.ts`. NEVER define types in module files. Re-export if needed.
- ALL middleware lives in `shared/middleware/`. Modules do NOT define their own middleware.

### TypeScript rules

- strict mode is ON. NEVER use `any`. Use `unknown` + type guards for unparsed data (e.g., LLM responses).
- ALWAYS use `import` syntax, NEVER `require()`. esModuleInterop is true.
- ALWAYS provide generic type to `db.query<T>()`. Example: `db.query<Contract>('SELECT ...')`.
- ALWAYS use parameterized queries ($1, $2...). NEVER interpolate values into SQL strings.
- Async/await everywhere. NEVER use callbacks.
- Export typed functions or classes from services. Each export has an explicit return type.

### Zod validation rules

- EVERY route that accepts a body MUST have a Zod schema in `{module}.schema.ts`.
- Use `zodMiddleware(schema)` in the route chain — it validates `req.body` and returns 400 on failure.
- ALWAYS infer TypeScript types from Zod schemas: `export type CreateContractInput = z.infer<typeof createContractSchema>;`
- NEVER duplicate types manually when a Zod schema exists. The schema IS the type definition.
- Zod schemas define what the CLIENT sends. DB types in shared/types/index.ts define what the DB returns. These are different shapes — do NOT conflate them.

### DB rules

- Use pg Pool from `shared/db/client.ts` for ALL data queries.
- Use Supabase client from `shared/db/client.ts` ONLY for Storage operations (upload/download images).
- ALWAYS use RETURNING * on INSERT/UPDATE to get the full row back.
- UUID for all IDs — `gen_random_uuid()` in DB, `uuid` package in code when needed client-side.
- Decimal amounts (EUR) are `DECIMAL(10,2)` in DB, `number` in TypeScript.
- All timestamps are `TIMESTAMPTZ` in DB. Use ISO strings in API responses.

### State machine rules

- EVERY contract status change MUST go through `validateTransition()` in `modules/contracts/stateMachine.ts`.
- NEVER directly UPDATE contracts SET status without calling validateTransition() first.
- EVERY status change MUST log an audit event via `audit.service.logAuditEvent()`.
- The actor (landlord/tenant/system) for each transition is fixed — validate actor role before allowing the transition.

### Error handling rules

- ALWAYS wrap route handlers in `asyncHandler()` from `shared/middleware/errorHandler.ts`.
- Throw `AppError` from `shared/utils/errors.ts` for expected errors (400, 401, 403, 404, 409).
- Let unexpected errors propagate to the central error handler — it catches, logs, returns 500.
- NEVER return raw error messages to the client in production. Sanitize in errorHandler.
- NEVER use try/catch inside route handlers — let asyncHandler handle it. Use try/catch only in services when you need to handle a specific failure (e.g., Solana call).

### LLM rules

- NEVER send all images in one API call. Send check-in + check-out images PER ROOM.
- ALWAYS parse and validate LLM responses. The response may be broken JSON, markdown-wrapped, or complete garbage.
- ALWAYS sanitize severity to one of: 'none', 'minor', 'medium', 'major'. Default to 'minor' if unknown.
- ALWAYS clamp confidence to 0.0-1.0. Default to 0.5 if missing/invalid.
- ALWAYS store raw_llm_response in analysis_results — for debugging.
- When MOCK_LLM=true, return hardcoded responses per room type. NEVER call Gemini API in mock mode.

### Blockchain rules

- EVERY Solana call MUST be wrapped in try/catch. If it fails, log a warning and continue — Solana is NOT critical path.
- NEVER put personal data on Solana. Only hashes, amounts in lamports, and wallet pubkeys.
- PDA seed format: `["rental", contractIdAsBytes]`.
- Solana is called at 5 moments only: contract creation (initialize), tenant accepts (lock_deposit), check-in approved (record_checkin), check-out approved (record_checkout), finalization (execute_settlement).
- Everything between those moments (rejections, re-uploads, LLM analysis) is off-chain.

### Audit rules

- EVERY significant action logs an audit event. Missing audit = broken feature.
- Audit events form a hash chain: each event's hash includes the previous event's hash.
- Audit is append-only. NEVER update or delete audit events.
- Audit service is a LEAF — it never calls other modules. Other modules call INTO audit.

## Env vars

```
# Supabase
DATABASE_URL                 # postgresql://... connection string
SUPABASE_URL                 # https://xxxxx.supabase.co
SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY         # server-side operations

# Firebase
FIREBASE_PROJECT_ID
FIREBASE_PRIVATE_KEY         # with \n escapes
FIREBASE_CLIENT_EMAIL

# Gemini
GEMINI_API_KEY

# Solana
SOLANA_RPC_URL               # https://api.devnet.solana.com
SOLANA_AUTHORITY_KEYPAIR     # JSON byte array
SOLANA_PROGRAM_ID

# App
PORT                         # default 3000
NODE_ENV                     # development | production
MOCK_AUTH                    # true = use X-Mock-User header
MOCK_LLM                    # true = hardcoded LLM responses
```

ALL vars are validated at startup by Zod in `config/env.ts`. Missing required var → server crashes immediately with a clear error message.

## Types — single source of truth

ALL types are in `shared/types/index.ts`. Here are the key ones:

```typescript
// Contract lifecycle — 14 states
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

export interface Room {
  id: string;
  contract_id: string;
  room_type: RoomType;
  custom_name: string | null;
  is_mandatory: boolean;
  display_order: number;
  created_at: Date;
}

export interface InspectionImage {
  id: string;
  contract_id: string;
  room_id: string;
  inspection_type: InspectionType;
  image_url: string;
  image_hash: string;
  captured_at: Date;
  gps_lat: number | null;
  gps_lng: number | null;
  device_id: string;
  note: string | null;
  image_index: number;
  uploaded_by: string;
  created_at: Date;
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
  explanation: string;
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

### Express Request extension (shared/types/express.d.ts)

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

## Patterns — use these exactly

### Route handler pattern

```typescript
import { Router } from 'express';
import { asyncHandler } from '../../shared/middleware/errorHandler';
import { authMiddleware } from '../../shared/middleware/auth';
import { zodMiddleware } from '../../shared/middleware/validate';
import { createContractSchema } from './contracts.schema';
import * as contractsService from './contracts.service';

const router = Router();

router.post('/',
  authMiddleware,
  zodMiddleware(createContractSchema),
  asyncHandler(async (req, res) => {
    const contract = await contractsService.create(req.user, req.body);
    res.status(201).json({ contract });
  })
);

export default router;
```

### Zod schema pattern

```typescript
import { z } from 'zod';

export const createContractSchema = z.object({
  property_address: z.string().min(1).max(500),
  property_gps: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
  rent_monthly_eur: z.number().positive(),
  deposit_amount_eur: z.number().positive(),
  start_date: z.string().date(),
  end_date: z.string().date(),
  deposit_rules: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  rooms: z.array(z.object({
    room_type: z.enum(['kuhinja', 'kupatilo', 'dnevna_soba', 'spavaca_soba',
                        'hodnik', 'balkon', 'ostava', 'terasa', 'garaza', 'druga']),
    custom_name: z.string().max(100).optional(),
    is_mandatory: z.boolean().default(true),
  })).min(1).max(15),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;
```

### Zod middleware pattern

```typescript
import { z, ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function zodMiddleware(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}
```

### Service pattern (DB interaction)

```typescript
import { db } from '../../shared/db/client';
import type { Contract, User } from '../../shared/types';
import type { CreateContractInput } from './contracts.schema';
import { AppError } from '../../shared/utils/errors';
import { logAuditEvent } from '../audit/audit.service';
import { generateInviteCode } from './inviteService';
import { sha256 } from '../../shared/utils/hash';

export async function create(user: User, input: CreateContractInput): Promise<Contract> {
  const inviteCode = generateInviteCode();
  const contractHash = sha256(JSON.stringify({
    ...input,
    landlord_id: user.id,
    invite_code: inviteCode,
  }));

  const result = await db.query<Contract>(
    `INSERT INTO contracts
       (landlord_id, invite_code, property_address, property_gps_lat, property_gps_lng,
        rent_monthly_eur, deposit_amount_eur, start_date, end_date,
        deposit_rules, notes, contract_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')
     RETURNING *`,
    [user.id, inviteCode, input.property_address,
     input.property_gps?.lat ?? null, input.property_gps?.lng ?? null,
     input.rent_monthly_eur, input.deposit_amount_eur,
     input.start_date, input.end_date,
     input.deposit_rules ?? null, input.notes ?? null,
     contractHash]
  );

  const contract = result.rows[0];

  // Insert rooms
  for (const [i, room] of input.rooms.entries()) {
    await db.query(
      `INSERT INTO rooms (contract_id, room_type, custom_name, is_mandatory, display_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [contract.id, room.room_type, room.custom_name ?? null, room.is_mandatory, i]
    );
  }

  await logAuditEvent(contract.id, 'CONTRACT_CREATED', user.id, 'landlord', {
    contract_hash: contractHash,
  });

  return contract;
}
```

### Error class pattern

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = 'BAD_REQUEST'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Usage in services:
throw new AppError('Contract not found', 404, 'NOT_FOUND');
throw new AppError('Invalid state transition', 409, 'INVALID_TRANSITION');
throw new AppError('Only the tenant can approve check-in', 403, 'FORBIDDEN');
```

### asyncHandler pattern

```typescript
import { Request, Response, NextFunction } from 'express';

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// Central error handler (mounted last in app.ts)
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
```

### Auth middleware pattern

```typescript
import admin from 'firebase-admin';
import { env } from '../../config/env';
import { db } from '../db/client';
import type { User } from '../types';

const MOCK_USERS: Record<string, Omit<User, 'created_at' | 'updated_at'>> = {
  landlord_marko: {
    id: 'mock-landlord-001', phone: '+381641111111',
    display_name: 'Marko Petrović', firebase_uid: 'mock-firebase-landlord',
    device_id: 'mock-device-1', solana_pubkey: null,
  },
  tenant_ana: {
    id: 'mock-tenant-001', phone: '+381642222222',
    display_name: 'Ana Jovanović', firebase_uid: 'mock-firebase-tenant',
    device_id: 'mock-device-2', solana_pubkey: null,
  },
};

export async function authMiddleware(req, res, next) {
  if (env.MOCK_AUTH === 'true') {
    const mockKey = req.headers['x-mock-user'] as string;
    if (!mockKey || !MOCK_USERS[mockKey]) {
      return res.status(401).json({ error: 'Invalid X-Mock-User header' });
    }
    req.user = MOCK_USERS[mockKey] as User;
    return next();
  }

  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = await findOrCreateUser(decoded);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

## State machine

14 states, fixed transitions, fixed actor roles. Defined in `modules/contracts/stateMachine.ts`.

```
draft → pending_acceptance                    (landlord sends invite)
pending_acceptance → accepted                 (tenant accepts)
accepted → checkin_in_progress                (landlord starts check-in)
checkin_in_progress → checkin_pending_approval (landlord finishes photos)
checkin_pending_approval → active             (tenant approves photos)
checkin_pending_approval → checkin_rejected    (tenant rejects photos)
checkin_rejected → checkin_in_progress         (landlord re-photographs)
active → checkout_in_progress                 (tenant starts check-out)
checkout_in_progress → checkout_pending_approval (tenant finishes photos)
checkout_pending_approval → pending_analysis  (landlord approves photos)
checkout_pending_approval → checkout_rejected (landlord rejects photos)
checkout_rejected → checkout_in_progress      (tenant re-photographs)
pending_analysis → settlement                 (system — LLM + rule engine)
settlement → completed                       (both finalize)
Any state with allowed cancel → cancelled
```

```typescript
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

export const TRANSITION_ACTORS: Record<string, ActorRole> = {
  'draft → pending_acceptance':                     'landlord',
  'pending_acceptance → accepted':                  'tenant',
  'accepted → checkin_in_progress':                 'landlord',
  'checkin_in_progress → checkin_pending_approval':  'landlord',
  'checkin_pending_approval → active':              'tenant',
  'checkin_pending_approval → checkin_rejected':    'tenant',
  'checkin_rejected → checkin_in_progress':         'landlord',
  'active → checkout_in_progress':                  'tenant',
  'checkout_in_progress → checkout_pending_approval': 'tenant',
  'checkout_pending_approval → pending_analysis':   'landlord',
  'checkout_pending_approval → checkout_rejected':  'landlord',
  'checkout_rejected → checkout_in_progress':       'tenant',
  'pending_analysis → settlement':                  'system',
  'settlement → completed':                        'both',
};
```

## API routes

Base: `/api/v1`

All routes except `/auth/*` and `/contracts/invite/:code` require auth middleware.

```
POST   /auth/verify                      # Firebase token → user + session
GET    /auth/me                          # Current user profile

POST   /contracts                        # Create contract (landlord)
GET    /contracts                        # List my contracts
GET    /contracts/:id                    # Contract details + rooms
GET    /contracts/invite/:code           # Preview before accepting (no auth)
POST   /contracts/:id/accept             # Accept contract (tenant)
POST   /contracts/:id/cancel             # Cancel contract

POST   /contracts/:id/checkin/start      # Start check-in (landlord)
POST   /contracts/:id/checkin/images     # Upload images (multipart)
POST   /contracts/:id/checkin/complete   # Finish check-in
POST   /contracts/:id/checkin/approve    # Tenant approves
POST   /contracts/:id/checkin/reject     # Tenant rejects (body: {comment})
GET    /contracts/:id/checkin/images     # Get check-in images (thumbnails)
POST   /contracts/:id/checkout/start     # (same pattern as checkin)
POST   /contracts/:id/checkout/images
POST   /contracts/:id/checkout/complete
POST   /contracts/:id/checkout/approve
POST   /contracts/:id/checkout/reject

POST   /contracts/:id/analyze           # Trigger LLM analysis
GET    /contracts/:id/analysis           # Analysis results per room
GET    /contracts/:id/settlement         # Settlement breakdown
POST   /contracts/:id/finalize          # Finalize settlement

GET    /contracts/:id/audit             # Audit trail timeline
```

### Response format

```json
// Success
{ "contract": { ... } }
{ "contracts": [ ... ] }
{ "settlement": { ... } }
{ "events": [ ... ], "chain_valid": true }

// Error
{ "error": "Description", "code": "ERROR_CODE" }
```

## Rule engine

Pure deterministic function. Same input → same output. No AI, no DB calls.

```typescript
const DEDUCTION_RATES: Record<Severity, number> = {
  none:   0,
  minor:  0.03,   // 3% of deposit
  medium: 0.10,   // 10%
  major:  0.25,   // 25%
};
const CONFIDENCE_THRESHOLD = 0.6;
```

Rules applied in order:
1. `wear_and_tear: true` → 0% deduction, skip finding
2. `confidence < 0.6` → skip finding, flag for manual review
3. Apply DEDUCTION_RATES[severity] × deposit_amount
4. Cap total at 100% of deposit
5. If total > 50% → requires_manual_review: true
6. If any low-confidence finding → requires_manual_review: true

## LLM prompt

Send to Gemini for each room with check-in (BEFORE) and check-out (AFTER) images:

```
Ti si stručnjak za procenu stanja nekretnina. Dobijaš dve grupe slika iste prostorije:
- Grupa "BEFORE" (check-in): stanje pri useljenju
- Grupa "AFTER" (check-out): stanje pri iseljenju

Tvoj zadatak je ISKLJUČIVO da identifikuješ i opišeš promene između BEFORE i AFTER stanja.
NE donosiš finansijske odluke. NE procenjuješ troškove popravke.

Za svaku detektovanu promenu:
1. Opiši šta se promenilo (kratko, precizno)
2. Identifikuj predmet/površinu
3. Klasifikuj ozbiljnost: "none" | "minor" | "medium" | "major"
4. Proceni sigurnost (confidence) 0.0-1.0
5. Da li je "normalno habanje" (wear_and_tear): true/false

Odgovori ISKLJUČIVO u JSON formatu, bez markdown formatiranja:
{
  "room": "naziv",
  "findings": [{ "item", "description", "severity", "confidence", "wear_and_tear", "location_in_image" }],
  "summary": "...",
  "overall_condition": "excellent|good|fair|damaged"
}
```

## Audit trail

Hash chain: each event's hash = SHA-256(contract_id + event_type + actor_id + data + previous_hash + timestamp). If any event is tampered with, the chain breaks and `verifyAuditChain()` returns false.

Events logged at every state change — see AuditEventType in types section.

## Solana integration

Called at 5 moments:
1. Contract created → `initialize()` — stores contract hash in PDA
2. Tenant accepts → `lock_deposit()` — tenant sends SOL to PDA escrow
3. Check-in approved → `record_checkin()` — stores image hash
4. Check-out approved → `record_checkout()` — stores image hash
5. Finalization → `execute_settlement()` — releases escrow per settlement split

PDA seed: `["rental", contractIdAsBytes]`

Everything else is off-chain. Solana calls are always wrapped in try/catch with graceful degradation.

## Common mistakes to avoid

1. Updating contract status without validateTransition() → broken state machine
2. Forgetting audit event after status change → broken audit trail
3. Sending all images to LLM in one call → token limit exceeded
4. Trusting raw LLM output → parse errors crash the pipeline
5. Putting personal data on Solana → privacy violation
6. Using Supabase JS for SQL queries → use pg Pool
7. Using `any` → use `unknown` + type guard
8. Missing ON DELETE CASCADE → orphaned records
9. Hardcoding env values → use config/env.ts
10. Defining types outside shared/types → type duplication

## Testing (manual)

```bash
# Health check
curl http://localhost:3000/health

# Create contract (mock auth)
curl -X POST http://localhost:3000/api/v1/contracts \
  -H "X-Mock-User: landlord_marko" \
  -H "Content-Type: application/json" \
  -d '{"property_address":"Test 1","rent_monthly_eur":400,"deposit_amount_eur":800,"start_date":"2026-04-01","end_date":"2027-04-01","rooms":[{"room_type":"kuhinja","is_mandatory":true}]}'

# List contracts
curl http://localhost:3000/api/v1/contracts \
  -H "X-Mock-User: landlord_marko"
```

## Deploy (Railway)

Build: `npm run build` (tsc → dist/)
Start: `node dist/index.js`
Env vars in Railway dashboard. Auto-deploy on GitHub push.