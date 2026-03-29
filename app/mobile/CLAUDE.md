# CLAUDE.md - RentSmart Mobile

## What this is

Expo React Native app for RentSmart. It handles Firebase phone auth, contract creation and invite flows, check-in/check-out camera capture, review flows, settlement review, and audit visibility.

Canonical product flow:
landlord creates contract -> tenant accepts -> landlord photographs check-in -> tenant approves or rejects -> tenant photographs check-out -> landlord approves or rejects -> system analyzes images -> both landlord and tenant approve settlement -> contract completes.

## Tech stack

- React Native + Expo SDK 52+
- expo-router
- TypeScript
- expo-camera
- expo-location
- expo-image-manipulator
- react-native-paper
- axios
- Zustand
- Firebase Auth

## Shared contract

The app must import API/domain types from `packages/contracts/src`.

- Do not keep a parallel `types/contract.ts`, `types/inspection.ts`, `types/settlement.ts`, or `types/audit.ts`.
- Mobile-specific local types are fine for UI state only.
- Request/response payloads, status enums, and audit/settlement shapes come from the shared package.

## Suggested structure

```text
mobile/
├── app/
│   ├── (auth)/
│   ├── (tabs)/
│   ├── contract/[id]/
│   ├── invite/[code].tsx
│   └── _layout.tsx
├── components/
├── services/
├── hooks/
├── store/
├── constants/
├── utils/
├── app.json
└── package.json

packages/
└── contracts/
    └── src/
```

## Auth model

- MVP auth uses Firebase ID tokens directly.
- The app sends `Authorization: Bearer <firebase_id_token>` on protected API calls.
- The backend does not mint a separate session JWT.
- `POST /auth/verify` is a bootstrap/upsert call after Firebase login succeeds.
- Secure storage should persist Firebase auth state/token handling, not a backend session token.

## Routing

### Auth flow

- Unauthenticated user sees `(auth)/login.tsx`.
- If the app does not yet have the user's display name after OTP confirmation, continue to `(auth)/register.tsx` before calling `/auth/verify`.
- Root layout switches between auth group and main app based on auth store.

### Main app

- `(tabs)/index.tsx`: dashboard
- `(tabs)/new-contract.tsx`: create contract
- `(tabs)/profile.tsx`: profile + logout
- `contract/[id]/index.tsx`: contract details
- `contract/[id]/checkin.tsx`: landlord camera flow
- `contract/[id]/checkout.tsx`: tenant camera flow
- `contract/[id]/review-images.tsx`: approval/rejection screen
- `contract/[id]/settlement.tsx`: settlement review + approvals
- `contract/[id]/audit.tsx`: audit timeline
- `invite/[code].tsx`: invite accept flow

## API contract

Base URL: `{API_URL}/api/v1`

Protected auth header:

```text
Authorization: Bearer {firebase_id_token}
```

Routes used by mobile:

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

## Contract lifecycle

Shared status enum comes from `packages/contracts`.

```text
draft
pending_acceptance
accepted
checkin_in_progress
checkin_pending_approval
checkin_rejected
active
checkout_in_progress
checkout_pending_approval
checkout_rejected
pending_analysis
settlement
completed
cancelled
```

Transition ownership:

```text
landlord: create contract, start/complete check-in, approve/reject check-out, approve settlement
tenant: accept contract, approve/reject check-in, start/complete check-out, approve settlement
system: run analysis and create settlement
```

Important settlement rule:

- `settlement` does not become `completed` after one button press.
- Each side approves separately through `POST /contracts/:id/settlement/approve`.
- UI must show who has approved already and whether the current user still needs to approve.

## Screen behavior

### Login

- User enters phone number.
- Firebase sends OTP.
- User confirms OTP.
- If needed, app collects `display_name` on `register.tsx`.
- App calls `POST /auth/verify` with Firebase token, display name, and device ID.
- App then uses Firebase token for future API calls.

### New contract

- Create landlord contract.
- On success show invite code/link and open native share sheet.

### Contract details

- Show status, summary, terms, rooms, invite section if relevant.
- Action buttons depend on role and status.

### Check-in

- Only landlord can access.
- Require camera + location permission and connectivity.
- Minimum 3 photos per mandatory room.
- Capture metadata per image: timestamp, GPS, device ID, hash.

### Check-out

- Only tenant can access.
- Show check-in thumbnails for the same room as reference.
- Same metadata rules as check-in.

### Review images

- Tenant reviews check-in.
- Landlord reviews check-out.
- Reject requires comment.

### Settlement

- Show deductions, skipped findings, explanation, and approval state.
- Primary CTA is `Approve settlement`, not `Finalize settlement`.
- If current user already approved, disable the CTA and show waiting state.
- When both sides approve, refresh status to `completed`.
- If `requires_manual_review` is true, show clear warning.
- Mobile does not directly trigger `/contracts/:id/analyze`; analysis starts from backend orchestration after checkout approval.

### Audit

- Show `/contracts/:id/audit`.
- No per-event detail endpoint in MVP; event details come from the timeline payload itself or a local modal.
- If Solana tx hash or explorer URL is included inside contract/audit payloads, render it as optional metadata.
- Solana only. No Sepolia or Etherscan references anywhere.

## Camera/upload contract

Use `expo-camera`, not `expo-image-picker`.

Client should resize images before upload. 1920px width is recommended for MVP.

Multipart upload is per room, but metadata arrays are per image:

```text
images[]:       File[]
room_id:        UUID
captured_at[]:  ISO timestamp per image
gps_lat[]:      number per image
gps_lng[]:      number per image
device_id[]:    string per image
notes[]:        optional string per image
```

Rules:

- timestamp must stay within server tolerance window
- GPS should remain near contract location
- device ID should stay consistent within the same inspection flow
- offline mode is not supported in MVP

## Service rules

### `services/api.ts`

- Attach Firebase bearer token.
- On `401`, sign the user out locally.
- Do not expect a backend session JWT.

### `services/auth.ts`

- Own Firebase sign-in and token retrieval.
- Call `/auth/verify` after successful Firebase login.

### `services/settlements.ts`

- Expose `getSettlement(contractId)` and `approveSettlement(contractId)`.
- Do not expose a `finalizeSettlement()` API for MVP.

## Common mistakes to avoid

1. Duplicating shared types inside mobile.
2. Treating `/auth/verify` as a login session endpoint.
3. Labeling settlement CTA as finalization instead of approval.
4. Assuming one approval completes settlement.
5. Sending one GPS/device value for a whole room upload.
6. Referring to Sepolia or Etherscan instead of Solana Devnet.
7. Designing screens for endpoints that are out of MVP scope.
