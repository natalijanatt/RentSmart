import type { Contract, Room } from '@rentsmart/contracts';

import type { DbContract, DbRoom } from '../types/index.js';

export function toRoom(db: DbRoom): Room {
  return {
    id: db.id,
    contract_id: db.contract_id,
    room_type: db.room_type as Room['room_type'],
    custom_name: db.custom_name,
    is_mandatory: db.is_mandatory,
    display_order: db.display_order,
  };
}

export function toContract(db: DbContract, rooms: DbRoom[]): Contract {
  return {
    id: db.id,
    landlord_id: db.landlord_id,
    tenant_id: db.tenant_id,
    invite_code: db.invite_code,
    property_address: db.property_address,
    property_gps_lat: db.property_gps_lat !== null ? parseFloat(db.property_gps_lat) : null,
    property_gps_lng: db.property_gps_lng !== null ? parseFloat(db.property_gps_lng) : null,
    rent_monthly_eur: parseFloat(db.rent_monthly_eur),
    deposit_amount_eur: parseFloat(db.deposit_amount_eur),
    start_date: db.start_date.toISOString(),
    end_date: db.end_date.toISOString(),
    deposit_rules: db.deposit_rules,
    notes: db.notes,
    plain_language_summary: db.plain_language_summary,
    status: db.status as Contract['status'],
    deposit_status: db.deposit_status,
    contract_hash: db.contract_hash,
    rejection_comment: db.rejection_comment,
    solana_pda: db.solana_pda,
    solana_tx_init: db.solana_tx_init,
    created_at: db.created_at.toISOString(),
    updated_at: db.updated_at.toISOString(),
    rooms: rooms.map(toRoom),
  };
}
