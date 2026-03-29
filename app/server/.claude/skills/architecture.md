# RentSmart Backend — Architecture Overview

## Modular structure

```
src/
├── index.ts                        # Entry: create app, listen
├── app.ts                          # Express app: middleware chain, mount module routers
│
├── modules/
│   ├── auth/
│   │   ├── auth.routes.ts          # POST /auth/verify, GET /auth/me
│   │   ├── auth.service.ts         # findOrCreateUser, Firebase token → User
│   │   └── auth.schema.ts          # Zod: VerifyBody, MockHeader
│   │
│   ├── contracts/
│   │   ├── contracts.routes.ts     # CRUD + accept + cancel
│   │   ├── contracts.service.ts    # create, list, getById, accept, cancel
│   │   ├── contracts.schema.ts     # Zod: CreateContractBody, AcceptBody
│   │   ├── stateMachine.ts         # STATE_TRANSITIONS, TRANSITION_ACTORS, validateTransition()
│   │   └── inviteService.ts        # generateInviteCode(), formatInviteLink()
│   │
│   ├── inspections/
│   │   ├── inspections.routes.ts   # checkin/checkout: start, images, complete, approve, reject
│   │   ├── inspections.service.ts  # orchestrates image upload + state transitions
│   │   ├── inspections.schema.ts   # Zod: ImageUploadBody, RejectBody
│   │   ├── imageService.ts         # Supabase Storage: upload, download, getSignedUrl
│   │   └── metadataValidator.ts    # GPS proximity, timestamp drift, device consistency
│   │
│   ├── analysis/
│   │   ├── analysis.routes.ts      # POST analyze, GET analysis, GET settlement, POST finalize
│   │   ├── analysis.service.ts     # orchestrator: fetch images → LLM → rule engine → save
│   │   ├── llmService.ts           # Gemini Vision: analyzeRoom(), parseResponse(), mock
│   │   ├── ruleEngine.ts           # calculateSettlement() — pure function, zero deps
│   │   └── analysis.schema.ts     # Zod: FinalizeBody
│   │
│   ├── audit/
│   │   ├── audit.routes.ts         # GET /contracts/:id/audit
│   │   ├── audit.service.ts        # logAuditEvent(), verifyAuditChain()
│   │   └── audit.types.ts          # AuditEventType enum (re-exported from shared)
│   │
│   └── blockchain/
│       ├── blockchain.routes.ts    # GET /contracts/:id/blockchain (optional verification)
│       ├── solana.service.ts       # SolanaService class: init, lock, record, settle
│       └── blockchain.types.ts     # SolanaAgreement, TxResult
│
├── shared/
│   ├── types/
│   │   ├── index.ts                # ALL domain types — single source of truth
│   │   └── express.d.ts            # Augment Express.Request with user: User
│   ├── middleware/
│   │   ├── auth.ts                 # Firebase verify + mock auth (MOCK_AUTH toggle)
│   │   ├── errorHandler.ts         # asyncHandler wrapper + central error middleware
│   │   └── validate.ts             # zodMiddleware(schema) → validates req.body
│   ├── db/
│   │   ├── client.ts               # pg Pool (SQL) + Supabase client (Storage only)
│   │   └── migrations/
│   │       └── 001_initial.sql     # All 7 tables, ENUMs, indexes
│   └── utils/
│       ├── hash.ts                 # sha256(data), sha256Chain(prev, current)
│       ├── geo.ts                  # haversineDistance(lat1, lng1, lat2, lng2)
│       └── errors.ts               # AppError class with statusCode + code
│
└── config/
    └── env.ts                      # Zod schema for ALL env vars, parsed at startup
```

## Module dependency rules

```
auth           → shared only
contracts      → shared, audit
inspections    → shared, audit, contracts (for state transitions)
analysis       → shared, audit, contracts, inspections (for images)
audit          → shared only
blockchain     → shared only
```

RULE: No circular dependencies. Audit is a leaf — other modules call INTO audit, audit never calls out.
RULE: Blockchain is a leaf — called by contracts, inspections, analysis at key moments, never calls other modules.
RULE: Analysis depends on inspections (to fetch images) and contracts (to read deposit amount). This is the only "deep" dependency chain.

## Data flow: check-in → analysis → settlement

```
1. POST /contracts/:id/checkin/start
   → inspections.service.startCheckin()
   → contracts.stateMachine.validateTransition(accepted → checkin_in_progress)
   → audit.service.logAuditEvent(CHECKIN_STARTED)

2. POST /contracts/:id/checkin/images (multipart)
   → inspections.metadataValidator.validate(gps, timestamp, device)
   → inspections.imageService.upload(files) → Supabase Storage
   → INSERT inspection_images rows
   → audit.service.logAuditEvent(CHECKIN_IMAGE_CAPTURED)

3. POST /contracts/:id/checkin/complete
   → validate all mandatory rooms have ≥3 images
   → contracts.stateMachine.validateTransition(checkin_in_progress → checkin_pending_approval)
   → audit.service.logAuditEvent(CHECKIN_COMPLETED)

4. POST /contracts/:id/checkin/approve
   → contracts.stateMachine.validateTransition(checkin_pending_approval → active)
   → blockchain.solana.service.recordCheckin(imageHash) [optional]
   → audit.service.logAuditEvent(CHECKIN_APPROVED)

--- same pattern for checkout ---

5. POST /contracts/:id/analyze (auto-triggered after checkout approve)
   → analysis.service.runAnalysis()
     → inspections.imageService.downloadAll(checkin + checkout)
     → FOR EACH room:
         → analysis.llmService.analyzeRoom(before[], after[])
         → INSERT analysis_results
     → analysis.ruleEngine.calculateSettlement(deposit, results)
     → INSERT settlements
   → contracts.stateMachine.validateTransition(pending_analysis → settlement)
   → audit.service.logAuditEvent(SETTLEMENT_PROPOSED)

6. POST /contracts/:id/finalize
   → contracts.stateMachine.validateTransition(settlement → completed)
   → blockchain.solana.service.executeSettlement() [optional]
   → audit.service.logAuditEvent(SETTLEMENT_FINALIZED)
```

## Request lifecycle

```
Request
  → Express JSON/CORS/Morgan middleware
  → authMiddleware (Firebase verify OR mock)
  → zodMiddleware(schema) — validates req.body
  → route handler — delegates to service
  → service — business logic, calls DB, calls other services
  → asyncHandler catches errors
  → errorHandler middleware → { error: "..." } response
```

## Environment validation

All env vars are validated at startup via Zod in config/env.ts. If a required var is missing, the server crashes immediately with a clear error — no silent failures at runtime.

```typescript
// config/env.ts pattern
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  MOCK_AUTH: z.enum(['true', 'false']).default('false'),
  MOCK_LLM: z.enum(['true', 'false']).default('false'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  // ... all other vars
});

export const env = envSchema.parse(process.env);
```

## External service boundaries

| Service | Used by | How | Failure mode |
|---------|---------|-----|-------------|
| Supabase PostgreSQL | All modules via shared/db | pg Pool, parameterized SQL | Server crashes — DB is critical path |
| Supabase Storage | inspections.imageService | @supabase/supabase-js upload/download | 500 on image upload — user retries |
| Firebase Admin SDK | shared/middleware/auth | verifyIdToken() | 401 — toggle MOCK_AUTH for dev |
| Gemini Vision API | analysis.llmService | @google/generative-ai | Falls back to MOCK_LLM responses |
| Solana Devnet | blockchain.solana.service | @coral-xyz/anchor | Graceful degradation — log warning, continue |

## Key design decisions

1. **pg Pool for SQL, Supabase client for Storage only.** Never use Supabase JS client for data queries — pg Pool is faster and gives full SQL control.

2. **Zod schemas generate types AND validate at runtime.** Define schema once in module's .schema.ts, infer type with z.infer<typeof schema>, validate in middleware. No duplication.

3. **State machine is the gatekeeper.** Every status change goes through validateTransition(). No direct UPDATE of contract status anywhere else.

4. **Audit is append-only.** logAuditEvent() is called FROM other services, never the other way around. Audit never modifies contracts/inspections/analysis data.

5. **Blockchain is best-effort.** Every Solana call is wrapped in try/catch. If it fails, the operation continues — Solana is a bonus verification layer, not critical path.

6. **LLM output is always validated.** parseResponse() in llmService handles broken JSON, markdown fences, invalid severity values, out-of-range confidence. Never trust raw LLM output.

7. **Rule engine is a pure function.** calculateSettlement() takes deposit amount + analysis results, returns settlement. No DB calls, no side effects, fully unit-testable.