import type { PoolClient } from 'pg';

import type { ActorRole, AuditEvent, AuditEventType, AuditTrailResponse } from '@rentsmart/contracts';

import { query, queryOne } from '../../shared/db/index.js';
import type { DbAuditEvent } from '../../shared/types/index.js';
import { AppError } from '../../shared/utils/errors.js';
import { sha256Chain } from '../../shared/utils/hash.js';

/** Deterministic JSON serialization — sorts keys recursively to prevent JSONB reordering issues. */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const sorted = Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]));
  return '{' + sorted.join(',') + '}';
}

function toAuditEvent(db: DbAuditEvent): AuditEvent {
  return {
    id: db.id,
    contract_id: db.contract_id,
    event_type: db.event_type as AuditEventType,
    actor_id: db.actor_id,
    actor_role: db.actor_role as ActorRole | null,
    data: db.data as Record<string, unknown>,
    event_hash: db.event_hash,
    previous_hash: db.previous_hash,
    created_at: db.created_at.toISOString(),
  };
}

export async function logAuditEvent(
  contractId: string,
  eventType: AuditEventType,
  actorId: string | null,
  actorRole: ActorRole | null,
  data: Record<string, unknown>,
  client?: PoolClient,
): Promise<AuditEvent> {
  const runQuery = async <T>(text: string, params: unknown[]): Promise<T | null> => {
    if (client) {
      const result = await client.query<T & Record<string, unknown>>(text, params);
      return (result.rows[0] as T) ?? null;
    }
    return queryOne<T & Record<string, unknown>>(text, params) as Promise<T | null>;
  };

  const lastEvent = await runQuery<DbAuditEvent>(
    `SELECT event_hash FROM audit_events WHERE contract_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [contractId],
  );

  const previousHash = lastEvent?.event_hash ?? '';
  const now = new Date();

  // Use stableStringify so JSONB key reordering doesn't break the chain on read-back
  const hashInput = stableStringify({
    contract_id: contractId,
    event_type: eventType,
    actor_id: actorId,
    data,
    created_at: now.toISOString(),
  });

  const eventHash = sha256Chain(previousHash, hashInput);

  const row = await runQuery<DbAuditEvent>(
    `INSERT INTO audit_events (contract_id, event_type, actor_id, actor_role, data, event_hash, previous_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [contractId, eventType, actorId, actorRole, JSON.stringify(data), eventHash, previousHash || null, now],
  );

  if (!row) {
    throw AppError.internal('Failed to insert audit event.');
  }

  return toAuditEvent(row);
}

export async function getAuditTrail(
  contractId: string,
  requesterId: string,
): Promise<AuditTrailResponse> {
  const contract = await queryOne<{ landlord_id: string; tenant_id: string | null }>(
    `SELECT landlord_id, tenant_id FROM contracts WHERE id = $1`,
    [contractId],
  );

  if (!contract) {
    throw AppError.notFound('Contract not found.');
  }

  if (requesterId !== contract.landlord_id && requesterId !== contract.tenant_id) {
    throw AppError.forbidden('Access denied.');
  }

  const rows = await query<DbAuditEvent>(
    `SELECT * FROM audit_events WHERE contract_id = $1 ORDER BY created_at ASC`,
    [contractId],
  );

  const events = rows.map(toAuditEvent);

  let chainValid = true;
  let prevHash = '';

  for (const event of events) {
    const hashInput = stableStringify({
      contract_id: event.contract_id,
      event_type: event.event_type,
      actor_id: event.actor_id,
      data: event.data,
      created_at: event.created_at,
    });

    const expected = sha256Chain(prevHash, hashInput);

    if (expected !== event.event_hash) {
      chainValid = false;
      break;
    }

    prevHash = event.event_hash;
  }

  return { events, chain_valid: chainValid };
}
