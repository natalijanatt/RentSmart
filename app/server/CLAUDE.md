# CLAUDE.md - RentSmart Server

## What this is

Express + TypeScript backend for RentSmart. It serves the Expo mobile app, owns the contract state machine, stores data in PostgreSQL, stores images in Supabase Storage, runs Gemini image comparison, computes settlement deterministically, logs an audit hash chain, and optionally mirrors key hashes to Solana Devnet.

Canonical flow:
landlord creates contract -> tenant accepts -> landlord performs check-in -> tenant approves or rejects -> tenant performs check-out -> landlord approves or rejects -> system runs analysis + rule engine -> both landlord and tenant approve settlement -> contract completes.

## Tech stack

- Runtime: Node.js + Express + TypeScript strict mode
- DB: PostgreSQL on Supabase via `pg`
- Storage: Supabase Storage via `@supabase/supabase-js`
- Auth: Firebase Admin SDK, with `MOCK_AUTH=true` fallback for development
- LLM: Google Gemini 1.5 Pro Vision, with `MOCK_LLM=true` fallback
- Blockchain: Solana Devnet + Anchor client
- Validation: Zod
- Deploy: Railway

## Repo contract

The shared API/domain contract lives in `packages/contracts/src`.

- Server and mobile both import request/response schemas and shared domain types from `packages/contracts`.
- Do not hand-copy contract, inspection, settlement, or audit types into app-specific folders.
- Server-local types are limited to internal concerns like Express augmentation and DB row helpers.

## Project structure

```text
src/
├── index.ts
├── app.ts
├── modules/
│   ├── auth/
│   ├── contracts/
│   ├── inspections/
│   ├── analysis/
│   ├── audit/
│   └── blockchain/
├── shared/
│   ├── types/express.d.ts
│   ├── middleware/
│   ├── db/
│   └── utils/
└── config/env.ts

packages/
└── contracts/
    └── src/
        ├── auth.ts
        ├── contracts.ts
        ├── inspections.ts
        ├── settlement.ts
        ├── audit.ts
        └── index.ts
```

Each module keeps HTTP in `*.routes.ts`, business logic in `*.service.ts`, and Zod schemas in `*.schema.ts`.

## Commands

```bash
npm run dev
npm run build
npm run start
```

## Non-negotiable rules

### Architecture

- Routes call services. Routes do not contain business logic.
- Never import another module's internals. Only use its public service API.
- Allowed dependency direction:
  `auth -> shared + packages/contracts`
  `contracts -> shared + packages/contracts + audit`
  `inspections -> shared + packages/contracts + audit + contracts`
  `analysis -> shared + packages/contracts + audit + contracts + inspections`
  `audit -> shared + packages/contracts`
  `blockchain -> shared`
- No circular dependencies.

### Types and validation

- Shared request/response/domain types come from `packages/contracts`.
- Infer TS types from Zod schemas where possible.
- Never use `any`.
- All request bodies must be validated with Zod middleware.

### Database

- Use `pg` for all SQL.
- Use Supabase client only for Storage.
- Use parameterized queries only.
- Use `RETURNING *` on insert/update when the full row is needed.
- Timestamps in DB are `TIMESTAMPTZ`; API returns ISO strings.

### Auth

- MVP auth is Firebase token based.
- Backend does not mint a separate session JWT.
- All protected routes accept `Authorization: Bearer <firebase_id_token>`.
- `POST /auth/verify` verifies the Firebase token, upserts the user, and returns the normalized user payload only.
- In mock mode, `X-Mock-User` is allowed instead.

### State machine

- Every contract status change must go through `validateTransition()`.
- Never update `contracts.status` directly without transition validation.
- Every state change must emit an audit event.
- `settlement -> completed` happens only after both landlord and tenant have approved the settlement.

### Inspections

- Check-in is photographed by the landlord.
- Check-out is photographed by the tenant.
- Reject flows require a comment.
- Image metadata is per image, not per room batch.
- Validate timestamp window, GPS distance, and device consistency.

### LLM

- Compare images per room only.
- Never send every room in one model call.
- Always validate model output.
- Clamp invalid severity/confidence.
- Persist raw model output for debugging.

### Blockchain

- Solana is optional verification, not critical path.
- All Solana calls must be wrapped in `try/catch`.
- No personal data on chain.
- Keep to Solana Devnet only.
- No separate public blockchain API endpoint in MVP.

## Canonical shared types

These types belong in `packages/contracts`, not duplicated app-side.

```ts
export type ContractStatus =
  | 'draft'
  | 'pending_acceptance'
  | 'accepted'
  | 'checkin_in_progress'
  | 'checkin_pending_approval'
  | 'checkin_rejected'
  | 'active'
  | 'checkout_in_progress'
  | 'checkout_pending_approval'
  | 'checkout_rejected'
  | 'pending_analysis'
  | 'settlement'
  | 'completed'
  | 'cancelled';

export type ActorRole = 'landlord' | 'tenant' | 'system' | 'both';
export type InspectionType = 'checkin' | 'checkout';
export type SettlementType = 'automatic' | 'manual_review';
```

Settlement approval is tracked per side. The settlement record needs:

```ts
interface SettlementApprovalState {
  landlord_approved_at: string | null;
  landlord_approved_by: string | null;
  tenant_approved_at: string | null;
  tenant_approved_by: string | null;
  finalized_at: string | null;
}
```

## State machine

```text
draft -> pending_acceptance                 landlord
pending_acceptance -> accepted              tenant
accepted -> checkin_in_progress             landlord
checkin_in_progress -> checkin_pending_approval landlord
checkin_pending_approval -> active          tenant
checkin_pending_approval -> checkin_rejected tenant
checkin_rejected -> checkin_in_progress     landlord
active -> checkout_in_progress              tenant
checkout_in_progress -> checkout_pending_approval tenant
checkout_pending_approval -> pending_analysis landlord
checkout_pending_approval -> checkout_rejected landlord
checkout_rejected -> checkout_in_progress   tenant
pending_analysis -> settlement              system
settlement -> completed                     both, after second approval is recorded
```

## API routes

Base: `/api/v1`

All routes except `/auth/*` and `/contracts/invite/:code` require Firebase bearer auth or mock auth.

```text
POST   /auth/verify
GET    /auth/me

POST   /contracts
GET    /contracts
GET    /contracts/:id
GET    /contracts/invite/:code
POST   /contracts/:id/accept
POST   /contracts/:id/cancel

POST   /contracts/:id/checkin/start
POST   /contracts/:id/checkin/images
POST   /contracts/:id/checkin/complete
POST   /contracts/:id/checkin/approve
POST   /contracts/:id/checkin/reject
GET    /contracts/:id/checkin/images

POST   /contracts/:id/checkout/start
POST   /contracts/:id/checkout/images
POST   /contracts/:id/checkout/complete
POST   /contracts/:id/checkout/approve
POST   /contracts/:id/checkout/reject

GET    /contracts/:id/analysis
GET    /contracts/:id/settlement
POST   /contracts/:id/settlement/approve

GET    /contracts/:id/audit
```

Not in MVP:

- `GET /contracts/:id/audit/:event_id`
- `GET /contracts/:id/blockchain`

Internal/system-only orchestration:

- `POST /contracts/:id/analyze`

## Request/response rules

### `POST /auth/verify`

Request body:

```json
{ "firebase_token": "string", "display_name": "string", "device_id": "string" }
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "phone": "+381641234567",
    "display_name": "Marko Petrovic",
    "device_id": "expo-abc123"
  },
  "auth_source": "firebase"
}
```

`display_name` is expected to be present by the time `/auth/verify` is called. If mobile needs a separate register/profile-completion step, it should collect the value before this request.

### Image upload

Multipart payload is per room, but metadata remains per image:

```text
images[]:       File[]
room_id:        UUID
captured_at[]:  ISO timestamp per image
gps_lat[]:      number per image
gps_lng[]:      number per image
device_id[]:    string per image
notes[]:        optional string per image
```

### Settlement approval

`POST /contracts/:id/settlement/approve` records approval for the current actor.

- If only one side has approved, contract stays in `settlement`.
- When the second side approves, backend sets `finalized_at`, emits settlement finalization audit event, executes Solana settlement if configured, and transitions contract to `completed`.

## Common mistakes to avoid

1. Updating contract status without `validateTransition()`.
2. Forgetting the audit event after a status change.
3. Treating `/auth/verify` as a session minting endpoint.
4. Storing shared API types outside `packages/contracts`.
5. Modeling settlement approval as a single-user action.
6. Sending image metadata once per room instead of once per image.
7. Exposing non-MVP blockchain or audit-detail endpoints.
