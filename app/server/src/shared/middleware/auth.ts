import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { firebaseAuth } from '../../config/firebase.js';
import { query } from '../db/index.js';
import { AppError } from '../utils/errors.js';
import type { DbUser } from '../types/index.js';

// Mock users for development (MOCK_AUTH=true)
const MOCK_USERS: Record<string, { firebase_uid: string; phone: string; display_name: string; device_id: string }> = {
  landlord_marko: {
    firebase_uid: 'mock_landlord_marko',
    phone: '+381641234567',
    display_name: 'Marko Petrovic',
    device_id: 'mock-device-landlord',
  },
  tenant_ana: {
    firebase_uid: 'mock_tenant_ana',
    phone: '+381697654321',
    display_name: 'Ana Nikolic',
    device_id: 'mock-device-tenant',
  },
};

async function resolveUser(firebaseUid: string): Promise<DbUser | null> {
  return query<DbUser>(
    'SELECT * FROM users WHERE firebase_uid = $1',
    [firebaseUid],
  ).then((rows) => rows[0] ?? null);
}

export const requireAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    if (env.MOCK_AUTH) {
      const mockHeader = req.headers['x-mock-user'];
      const mockKey = typeof mockHeader === 'string' ? mockHeader : undefined;

      if (!mockKey || !MOCK_USERS[mockKey]) {
        throw AppError.unauthorized(
          'MOCK_AUTH is enabled. Set X-Mock-User to landlord_marko or tenant_ana.',
        );
      }

      const mockDef = MOCK_USERS[mockKey];
      const dbUser = await resolveUser(mockDef.firebase_uid);

      if (!dbUser) {
        throw AppError.unauthorized(`Mock user "${mockKey}" not found in database. Run migrations and seed.`);
      }

      req.user = {
        id: dbUser.id,
        phone: dbUser.phone,
        display_name: dbUser.display_name,
        device_id: dbUser.device_id,
      };
      next();
      return;
    }

    // Firebase auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing or malformed Authorization header.');
    }

    const token = authHeader.slice(7);

    let decoded: import('firebase-admin/auth').DecodedIdToken;
    try {
      decoded = await firebaseAuth.verifyIdToken(token);
    } catch {
      throw AppError.unauthorized('Invalid or expired Firebase token.');
    }

    const dbUser = await resolveUser(decoded.uid);
    if (!dbUser) {
      throw AppError.unauthorized('User not found. Call POST /auth/verify first.');
    }

    req.user = {
      id: dbUser.id,
      phone: dbUser.phone,
      display_name: dbUser.display_name,
      device_id: dbUser.device_id,
    };
    next();
  } catch (err) {
    next(err);
  }
};
