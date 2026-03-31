import type { ActorRole, ContractStatus } from '@rentsmart/contracts';

import { AppError } from '../../shared/utils/errors.js';

interface TransitionRule {
  from: ContractStatus;
  to: ContractStatus;
  actor: ActorRole;
}

const TRANSITIONS: TransitionRule[] = [
  { from: 'draft',                     to: 'accepted',                  actor: 'tenant'   },
  { from: 'accepted',                  to: 'checkin_in_progress',       actor: 'landlord' },
  { from: 'checkin_in_progress',       to: 'checkin_pending_approval',  actor: 'landlord' },
  { from: 'checkin_pending_approval',  to: 'active',                    actor: 'tenant'   },
  { from: 'checkin_pending_approval',  to: 'checkin_rejected',          actor: 'tenant'   },
  { from: 'checkin_rejected',          to: 'checkin_in_progress',       actor: 'landlord' },
  { from: 'active',                    to: 'checkout_in_progress',      actor: 'tenant'   },
  { from: 'checkout_in_progress',      to: 'checkout_pending_approval', actor: 'tenant'   },
  { from: 'checkout_pending_approval', to: 'pending_analysis',          actor: 'landlord' },
  { from: 'checkout_pending_approval', to: 'checkout_rejected',         actor: 'landlord' },
  { from: 'checkout_rejected',         to: 'checkout_in_progress',      actor: 'tenant'   },
  { from: 'pending_analysis',          to: 'settlement',                actor: 'system'   },
  { from: 'settlement',                to: 'completed',                 actor: 'both'     },
];

const CANCELLABLE_STATUSES: ContractStatus[] = ['draft', 'accepted'];

export function validateTransition(
  from: ContractStatus,
  to: ContractStatus,
  actorRole: ActorRole,
): void {
  const allowed = TRANSITIONS.some(
    (rule) =>
      rule.from === from &&
      rule.to === to &&
      (rule.actor === actorRole || rule.actor === 'both'),
  );

  if (!allowed) {
    throw AppError.conflict(`Invalid transition: ${from} -> ${to} for role ${actorRole}`);
  }
}

export function assertCancellable(status: ContractStatus): void {
  if (!CANCELLABLE_STATUSES.includes(status)) {
    throw AppError.conflict('Contract cannot be cancelled in its current state.');
  }
}
