# RentSmart MVP — Implementation Guide

## 0. Goal
Build a mobile app for rental contracts with:
- contract lifecycle
- image-based inspection
- AI damage analysis
- deposit settlement

---

## 1. Stack

### Backend
- Node.js + Express
- PostgreSQL (Supabase)

### Frontend
- React Native (Expo)

### Storage
- Supabase Storage

### AI
- Gemini Vision (or mock)

---

## 2. Core Modules (Backend)

Implement modules:
- auth
- contracts
- inspections
- analysis
- settlements
- audit

---

## 3. Database (Required Tables)

Create tables:
- users
- contracts
- rooms
- inspection_images
- analysis_results
- settlements
- audit_events

Constraints:
- UUID primary keys
- ENUM for statuses
- indexes required

---

## 4. State Machine (MANDATORY)

All contract status changes MUST go through:

function:
transitionState(contractId, newStatus, actorRole)

DO NOT update status directly in DB.

Allowed transitions must be validated.

---

## 5. Auth

Implement:
POST /auth/verify

If Firebase not available:
- use mock users via header:
  X-Mock-User

---

## 6. Contracts

Endpoints:
- POST /contracts
- GET /contracts
- GET /contracts/:id
- POST /contracts/:id/accept

Must:
- generate invite_code
- store contract data
- create rooms

---

## 7. Invite System

Format:
RS-XXXXXX

Flow:
1. landlord creates contract
2. invite code generated
3. tenant accepts
4. status → accepted

---

## 8. Check-in / Check-out

Each room:
- minimum 3 images

Each image MUST include:
- timestamp
- gps coordinates
- device_id
- image_hash

Validation:
- timestamp within ±1h
- gps within 200m

---

## 9. Image Upload

Use:
- multipart/form-data

Store in:
{contract_id}/checkin/{room}/
{contract_id}/checkout/{room}/

---

## 10. Analysis (AI)

Input:
- check-in images
- check-out images

Output (STRICT JSON):
{
room: string,
findings: [
{
item: string,
description: string,
severity: "none|minor|medium|major",
confidence: number,
wear_and_tear: boolean
}
]
}

If AI fails:
- return mock response

---

## 11. Rule Engine

Rules:
- minor → 3%
- medium → 10%
- major → 25%

Conditions:
- wear_and_tear → ignore
- confidence < 0.6 → ignore + manual flag
- total deduction capped at 100%
- if >50% → manual review

---

## 12. Settlement

Return:
{
tenant_receives_eur: number,
landlord_receives_eur: number,
deductions: [],
requires_manual_review: boolean
}

---

## 13. Audit Trail

Each event MUST:
- include hash
- include previous_hash

Hash:
SHA256(previous_hash + event_data)

Chain must be verifiable.

---

## 14. Required API

Contracts:
- POST /contracts
- GET /contracts
- GET /contracts/:id
- POST /contracts/:id/accept

Check-in:
- POST /checkin/start
- POST /checkin/images
- POST /checkin/complete
- POST /checkin/approve
- POST /checkin/reject

Checkout:
- same as check-in

Analysis:
- POST /analyze
- GET /analysis

Settlement:
- GET /settlement
- POST /finalize

---

## 15. Frontend Screens

- Login
- Dashboard
- Create Contract
- Contract Details
- Check-in Camera
- Check-out Camera
- Review Images
- Settlement
- Audit

---

## 16. Edge Cases

Handle:
- missing images → block
- invalid GPS → reject
- invalid timestamp → reject
- AI failure → fallback
- duplicate uploads → ignore

---

## 17. Anti-Patterns (FORBIDDEN)

- direct DB status updates
- missing audit logs
- frontend settlement calculation
- images without metadata

---

## 18. Implementation Order

1. database
2. auth (mock)
3. contracts
4. state machine
5. check-in
6. upload images
7. check-out
8. mock AI
9. rule engine
10. settlement
11. audit
12. real AI

---

## 19. Definition of Done

App is complete when:
- contract lifecycle works
- images uploaded and validated
- AI analysis returns results
- settlement is calculated
- audit chain is valid