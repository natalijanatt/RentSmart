# Skill: Audit Module

## Context

Maintains an immutable, verifiable log of every significant event in a contract's lifecycle. Events form a hash chain — each event's hash includes the previous event's hash, creating a tamper-evident trail. If any event is modified retroactively, the chain breaks.

This module is a LEAF — other modules call INTO audit, audit NEVER calls other modules.

## Files in scope

```
src/modules/audit/
├── audit.routes.ts     # GET /contracts/:id/audit
├── audit.service.ts    # logAuditEvent(), verifyAuditChain()
└── audit.types.ts      # Re-exports AuditEventType from shared (convenience)
```

## Dependencies

- shared/db/client (pg Pool)
- shared/types (AuditEvent, AuditEventType, ActorRole)
- shared/utils/hash (sha256)

That's it. Audit depends on NOTHING else. It is called BY: contracts, inspections, analysis, blockchain.

## API endpoints

```
GET /api/v1/contracts/:id/audit              # Full timeline
GET /api/v1/contracts/:id/audit/:eventId     # Single event details (optional)
```

## Service: audit.service.ts

```typescript
import { db } from '../../shared/db/client';
import { sha256 } from '../../shared/utils/hash';
import type { AuditEvent, AuditEventType, ActorRole } from '../../shared/types';

export async function logAuditEvent(
  contractId: string,
  eventType: AuditEventType,
  actorId: string | null,
  actorRole: ActorRole | 'system',
  data: Record<string, unknown>
): Promise<AuditEvent> {
  // 1. Get the last event's hash for this contract
  const lastEvent = await db.query<{ event_hash: string }>(
    `SELECT event_hash FROM audit_events
     WHERE contract_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [contractId]
  );
  const previousHash = lastEvent.rows[0]?.event_hash ?? null;

  // 2. Build hash payload
  const timestamp = new Date().toISOString();
  const hashPayload = JSON.stringify({
    contract_id: contractId,
    event_type: eventType,
    actor_id: actorId,
    data,
    previous_hash: previousHash,
    timestamp,
  });
  const eventHash = sha256(hashPayload);

  // 3. Insert
  const result = await db.query<AuditEvent>(
    `INSERT INTO audit_events
       (contract_id, event_type, actor_id, actor_role, data, event_hash, previous_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [contractId, eventType, actorId, actorRole, data, eventHash, previousHash]
  );

  return result.rows[0];
}

export async function verifyAuditChain(contractId: string): Promise<boolean> {
  const events = await db.query<AuditEvent>(
    `SELECT * FROM audit_events
     WHERE contract_id = $1
     ORDER BY created_at ASC`,
    [contractId]
  );

  for (let i = 0; i < events.rows.length; i++) {
    const event = events.rows[i];

    // Check previous_hash linkage
    if (i === 0 && event.previous_hash !== null) return false;
    if (i > 0 && event.previous_hash !== events.rows[i - 1].event_hash) return false;

    // Reconstruct hash and compare
    const reconstructed = sha256(JSON.stringify({
      contract_id: event.contract_id,
      event_type: event.event_type,
      actor_id: event.actor_id,
      data: event.data,
      previous_hash: event.previous_hash,
      timestamp: event.created_at.toISOString(),
    }));

    if (reconstructed !== event.event_hash) return false;
  }

  return true;
}

export async function getAuditTrail(contractId: string): Promise<{
  events: AuditEvent[];
  chain_valid: boolean;
}> {
  const events = await db.query<AuditEvent>(
    `SELECT * FROM audit_events
     WHERE contract_id = $1
     ORDER BY created_at ASC`,
    [contractId]
  );

  const chainValid = await verifyAuditChain(contractId);

  return {
    events: events.rows,
    chain_valid: chainValid,
  };
}
```

## Routes: audit.routes.ts

```typescript
import { Router } from 'express';
import { asyncHandler } from '../../shared/middleware/errorHandler';
import { authMiddleware } from '../../shared/middleware/auth';
import { getAuditTrail } from './audit.service';

const router = Router();

router.get('/:id/audit',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const result = await getAuditTrail(req.params.id);
    res.json(result);
  })
);

export default router;
```

## Event types — when each is logged

```
CONTRACT_CREATED          → contracts.service.create()
INVITE_SENT               → contracts.service.create() (after invite code generated)
CONTRACT_ACCEPTED         → contracts.service.accept()
DEPOSIT_LOCKED            → blockchain.solana.service.lockDeposit() (if Solana enabled)
CHECKIN_STARTED           → inspections.service.startInspection('checkin')
CHECKIN_IMAGE_CAPTURED    → inspections.service.uploadRoomImages('checkin')
CHECKIN_COMPLETED         → inspections.service.completeInspection('checkin')
CHECKIN_APPROVED          → inspections.service.approveInspection('checkin')
CHECKIN_REJECTED          → inspections.service.rejectInspection('checkin')
CHECKOUT_STARTED          → inspections.service.startInspection('checkout')
CHECKOUT_IMAGE_CAPTURED   → inspections.service.uploadRoomImages('checkout')
CHECKOUT_COMPLETED        → inspections.service.completeInspection('checkout')
CHECKOUT_APPROVED         → inspections.service.approveInspection('checkout')
CHECKOUT_REJECTED         → inspections.service.rejectInspection('checkout')
LLM_ANALYSIS_STARTED      → analysis.service.runAnalysis()
LLM_ANALYSIS_COMPLETED    → analysis.service.runAnalysis()
RULE_ENGINE_EXECUTED       → analysis.service.runAnalysis()
SETTLEMENT_PROPOSED        → analysis.service.runAnalysis()
SETTLEMENT_VIEWED          → analysis.routes GET /settlement (optional)
SETTLEMENT_FINALIZED       → analysis.service.finalize()
DEPOSIT_RELEASED           → blockchain.solana.service.executeSettlement()
CONTRACT_HASH_STORED       → blockchain.solana.service.initializeContract()
CONTRACT_CANCELLED         → contracts.service.cancel()
```

## Hash chain mechanics

```
Event 1: hash = SHA-256(contract_id + event_type + data + null + timestamp)
Event 2: hash = SHA-256(contract_id + event_type + data + Event1.hash + timestamp)
Event 3: hash = SHA-256(contract_id + event_type + data + Event2.hash + timestamp)
```

If Event 2 is tampered with, Event 2's hash changes → Event 3's previous_hash no longer matches → chain is broken → verifyAuditChain returns false.

## DO

- DO call logAuditEvent from EVERY service function that changes contract state
- DO include relevant data in the event (from_status, to_status, image counts, hashes)
- DO verify the chain when returning audit trail to client
- DO keep this module completely independent — zero imports from other modules

## NEVER

- NEVER update an existing audit event — events are immutable
- NEVER delete audit events — the chain would break
- NEVER import from other modules in audit code — audit is a leaf
- NEVER skip logging an audit event for a state change — every transition must be logged
- NEVER modify the hash algorithm or payload structure after the first event is created — all future events would fail verification

## Common data payloads per event type

```typescript
// CONTRACT_CREATED
{ contract_hash: "sha256:..." }

// CHECKIN_IMAGE_CAPTURED
{ room_id: "...", room_type: "kuhinja", image_count: 3, image_hashes: ["..."] }

// CHECKIN_REJECTED
{ comment: "Photos are blurry, please retake bathroom" }

// LLM_ANALYSIS_COMPLETED
{ rooms_analyzed: 4 }

// RULE_ENGINE_EXECUTED
{ total_deduction_percent: 28, requires_manual_review: false }

// SETTLEMENT_PROPOSED
{ tenant_receives_eur: 616, landlord_receives_eur: 184 }
```

## Checklist

- [ ] logAuditEvent gets previous hash and chains correctly
- [ ] verifyAuditChain validates every link in the chain
- [ ] First event has previous_hash = null
- [ ] GET /audit returns events + chain_valid boolean
- [ ] No imports from other modules (leaf dependency)
- [ ] Hash payload includes all relevant fields
- [ ] Timestamps are ISO strings in hash payload