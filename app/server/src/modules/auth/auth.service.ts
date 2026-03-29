import { env } from '../../config/env.js';
import { firebaseAuth } from '../../config/firebase.js';
import { queryOne } from '../../shared/db/index.js';
import { AppError } from '../../shared/utils/errors.js';
import type { DbUser } from '../../shared/types/index.js';
import type { User } from '@rentsmart/contracts';

// ── Mock user definitions ─────────────────────────────────────────────────────

interface MockUserDef {
  firebase_uid: string;
  phone: string;
  display_name: string;
  device_id: string;
}

const MOCK_USER_DEFS: Record<string, MockUserDef> = {
  mock_landlord_marko: {
    firebase_uid: 'mock_landlord_marko',
    phone: '+381641234567',
    display_name: 'Marko Petrovic',
    device_id: 'mock-device-landlord',
  },
  mock_tenant_ana: {
    firebase_uid: 'mock_tenant_ana',
    phone: '+381697654321',
    display_name: 'Ana Nikolic',
    device_id: 'mock-device-tenant',
  },
};

// ── DB helpers ────────────────────────────────────────────────────────────────

async function upsertUser(
  firebaseUid: string,
  phone: string,
  displayName: string,
  deviceId: string,
): Promise<DbUser> {
  const row = await queryOne<DbUser>(
    `INSERT INTO users (phone, display_name, firebase_uid, device_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid) DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       device_id    = COALESCE(EXCLUDED.device_id,    users.device_id),
       updated_at   = NOW()
     RETURNING *`,
    [phone, displayName, firebaseUid, deviceId],
  );

  if (!row) throw AppError.internal('Upsert returned no row.');
  return row;
}

function toUser(db: DbUser): User {
  return {
    id: db.id,
    phone: db.phone,
    display_name: db.display_name,
    device_id: db.device_id,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Verifies the token, upserts the user, returns the normalized API user.
 *
 * Mock mode: firebase_token is treated as the mock user key
 * (e.g. "mock_landlord_marko"). Allows local dev without Firebase credentials.
 */
export async function verifyAndUpsert(
  firebaseToken: string,
  displayName: string | undefined,
  deviceId: string,
): Promise<User> {
  if (env.MOCK_AUTH) {
    const def = MOCK_USER_DEFS[firebaseToken];
    if (!def) {
      throw AppError.unauthorized(
        `Unknown mock token "${firebaseToken}". ` +
        `Use one of: ${Object.keys(MOCK_USER_DEFS).join(', ')}`,
      );
    }
    const db = await upsertUser(def.firebase_uid, def.phone, displayName ?? def.display_name, deviceId);
    return toUser(db);
  }

  // Real Firebase verification
  let decoded: import('firebase-admin/auth').DecodedIdToken;
  try {
    decoded = await firebaseAuth.verifyIdToken(firebaseToken);
  } catch {
    throw AppError.unauthorized('Invalid or expired Firebase token.');
  }

  const phone = decoded.phone_number;
  if (!phone) throw AppError.unauthorized('Firebase token has no phone_number claim.');

  const resolvedName = displayName ?? decoded.name ?? phone;
  const db = await upsertUser(decoded.uid, phone, resolvedName, deviceId);
  return toUser(db);
}

/**
 * Returns the current authenticated user by internal ID.
 */
export async function getMe(userId: string): Promise<User> {
  const db = await queryOne<DbUser>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!db) throw AppError.notFound('User not found.');
  return toUser(db);
}
