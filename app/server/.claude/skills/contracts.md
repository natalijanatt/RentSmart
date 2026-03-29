# Skill: Contracts Module

## Context

Manages the contract lifecycle: creation, invite system, acceptance, cancellation. Owns the state machine that governs ALL contract status transitions across the entire application. Other modules call `validateTransition()` from here before changing any contract status.

## Files in scope

```
src/modules/contracts/
├── contracts.routes.ts     # CRUD + accept + cancel
├── contracts.service.ts    # create, list, getById, accept, cancel
├── contracts.schema.ts     # Zod schemas for all request bodies
├── stateMachine.ts         # STATE_TRANSITIONS, TRANSITION_ACTORS, validateTransition()
└── inviteService.ts        # generateInviteCode(), formatInviteLink()
```

## Dependencies

- shared/db/client, shared/types, shared/utils/errors, shared/utils/hash
- modules/audit/audit.service (logAuditEvent)
- modules/blockchain/solana.service (initializeContract — optional)

## API endpoints

```
POST   /api/v1/contracts                # Create contract (landlord)
GET    /api/v1/contracts                # List my contracts (landlord + tenant)
GET    /api/v1/contracts/:id            # Contract details + rooms
GET    /api/v1/contracts/invite/:code   # Preview via invite code (NO auth)
POST   /api/v1/contracts/:id/accept     # Accept via invite (tenant)
POST   /api/v1/contracts/:id/cancel     # Cancel contract
```

## Zod schemas: contracts.schema.ts

```typescript
import { z } from 'zod';

const roomSchema = z.object({
  room_type: z.enum([
    'kuhinja', 'kupatilo', 'dnevna_soba', 'spavaca_soba',
    'hodnik', 'balkon', 'ostava', 'terasa', 'garaza', 'druga',
  ]),
  custom_name: z.string().max(100).optional(),
  is_mandatory: z.boolean().default(true),
});

export const createContractSchema = z.object({
  property_address: z.string().min(1).max(500),
  property_gps: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
  rent_monthly_eur: z.number().positive().max(100000),
  deposit_amount_eur: z.number().positive().max(100000),
  start_date: z.string().date(),   // YYYY-MM-DD
  end_date: z.string().date(),
  deposit_rules: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  rooms: z.array(roomSchema).min(1).max(15),
});

export const acceptContractSchema = z.object({
  invite_code: z.string().min(1),
});

export const cancelContractSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type AcceptContractInput = z.infer<typeof acceptContractSchema>;
```

## State machine: stateMachine.ts

This is the SINGLE SOURCE OF TRUTH for all state transitions in the app.

```typescript
import type { ContractStatus, ActorRole } from '../../shared/types';
import { AppError } from '../../shared/utils/errors';

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

export function validateTransition(
  currentStatus: ContractStatus,
  newStatus: ContractStatus,
  actorRole: ActorRole
): void {
  const allowed = STATE_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw AppError.conflict(
      `Invalid transition: ${currentStatus} → ${newStatus}`
    );
  }

  const key = `${currentStatus} → ${newStatus}`;
  const requiredActor = TRANSITION_ACTORS[key];

  if (requiredActor && requiredActor !== 'system' && requiredActor !== 'both') {
    if (requiredActor !== actorRole) {
      throw AppError.forbidden(
        `Only ${requiredActor} can trigger: ${key}. You are: ${actorRole}`
      );
    }
  }
}

export function getActorRole(
  userId: string,
  contract: { landlord_id: string; tenant_id: string | null }
): ActorRole {
  if (userId === contract.landlord_id) return 'landlord';
  if (userId === contract.tenant_id) return 'tenant';
  throw AppError.forbidden('You are not a party to this contract');
}
```

## Invite system: inviteService.ts

```typescript
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No 0/O, 1/I/L

export function generateInviteCode(): string {
  let code = 'RS-';
  for (let i = 0; i < 6; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

export function formatInviteLink(code: string): string {
  return `rentsmart://invite/${code}`;
}
```

## Service: contracts.service.ts — key function signatures

```typescript
export async function create(user: User, input: CreateContractInput): Promise<Contract>
export async function list(user: User): Promise<Contract[]>
export async function getById(contractId: string, user: User): Promise<Contract & { rooms: Room[] }>
export async function getByInviteCode(code: string): Promise<Contract & { rooms: Room[] }>
export async function accept(contractId: string, user: User): Promise<Contract>
export async function cancel(contractId: string, user: User, reason?: string): Promise<Contract>
export async function transitionStatus(
  contractId: string, newStatus: ContractStatus,
  actorId: string, actorRole: ActorRole,
  additionalData?: Record<string, unknown>
): Promise<Contract>
```

The `transitionStatus()` function is the gateway — it calls `validateTransition()`, updates the DB, and logs the audit event. Other modules use this function to change contract status.

## Routes: contracts.routes.ts — structure

```typescript
const router = Router();

// Public (no auth)
router.get('/invite/:code', asyncHandler(async (req, res) => {
  const contract = await contractsService.getByInviteCode(req.params.code);
  res.json({ contract });
}));

// Protected (auth required)
router.post('/', authMiddleware, zodMiddleware(createContractSchema), asyncHandler(...));
router.get('/', authMiddleware, asyncHandler(...));
router.get('/:id', authMiddleware, asyncHandler(...));
router.post('/:id/accept', authMiddleware, zodMiddleware(acceptContractSchema), asyncHandler(...));
router.post('/:id/cancel', authMiddleware, asyncHandler(...));

export default router;
```

## DO

- DO generate a unique invite_code and verify uniqueness in DB (retry on collision)
- DO compute contract_hash at creation time: SHA-256 of all contract terms
- DO return rooms alongside contract in getById response
- DO filter list() by user — show contracts where user is landlord OR tenant
- DO use transitionStatus() for ALL status changes — never raw UPDATE
- DO validate that end_date > start_date in the Zod schema or service

## NEVER

- NEVER expose invite/:code with auth — tenants need to preview before creating an account
- NEVER allow a landlord to accept their own contract — tenant_id must differ from landlord_id
- NEVER skip validateTransition() — it's the only thing preventing invalid state changes
- NEVER allow status change without logging audit event
- NEVER delete contracts — use 'cancelled' status instead

## Checklist

- [ ] createContractSchema validates all fields with proper constraints
- [ ] Invite code is unique (handle collision with retry)
- [ ] GET /contracts/invite/:code works without auth
- [ ] accept() sets tenant_id and transitions to 'accepted'
- [ ] cancel() checks that cancellation is allowed from current status
- [ ] list() returns contracts where user is either landlord or tenant
- [ ] getById() returns contract with rooms array
- [ ] All status changes go through transitionStatus()
- [ ] All status changes log audit events