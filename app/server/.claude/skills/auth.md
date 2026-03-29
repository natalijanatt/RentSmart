# Skill: Auth Module

## Context

Handles user authentication via Firebase Phone Auth (SMS OTP) with a mock fallback for development. This module creates/updates users in PostgreSQL and makes `req.user` available to all downstream route handlers.

## Files in scope

```
src/modules/auth/
├── auth.routes.ts      # POST /auth/verify, GET /auth/me
├── auth.service.ts     # findOrCreateUser(), getUserById()
└── auth.schema.ts      # Zod: verifyBodySchema
```

Plus shared middleware: `src/shared/middleware/auth.ts` (handles both Firebase and mock modes).

## Dependencies

- shared/db/client (pg Pool)
- shared/types (User)
- shared/middleware/errorHandler (asyncHandler)
- shared/utils/errors (AppError)
- config/env (MOCK_AUTH, Firebase config)
- firebase-admin SDK

## API endpoints

```
POST /api/v1/auth/verify    # No auth middleware — this IS the auth endpoint
GET  /api/v1/auth/me        # Requires auth middleware
```

## Zod schema: auth.schema.ts

```typescript
import { z } from 'zod';

export const verifyBodySchema = z.object({
  firebase_token: z.string().min(1),
  display_name: z.string().min(1).max(100),
  device_id: z.string().max(255).optional(),
});

export type VerifyInput = z.infer<typeof verifyBodySchema>;
```

## Service: auth.service.ts

```typescript
import { db } from '../../shared/db/client';
import type { User } from '../../shared/types';

export async function findOrCreateUser(
  firebaseUid: string,
  phone: string,
  displayName: string,
  deviceId: string | null
): Promise<User> {
  // Try to find existing user
  const existing = await db.query<User>(
    'SELECT * FROM users WHERE firebase_uid = $1',
    [firebaseUid]
  );

  if (existing.rows[0]) {
    // Update device_id and display_name on each login
    const updated = await db.query<User>(
      `UPDATE users
       SET display_name = $1, device_id = $2, updated_at = NOW()
       WHERE firebase_uid = $3
       RETURNING *`,
      [displayName, deviceId, firebaseUid]
    );
    return updated.rows[0];
  }

  // Create new user
  const created = await db.query<User>(
    `INSERT INTO users (phone, display_name, firebase_uid, device_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [phone, displayName, firebaseUid, deviceId]
  );
  return created.rows[0];
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await db.query<User>('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}
```

## Routes: auth.routes.ts

```typescript
import { Router } from 'express';
import admin from 'firebase-admin';
import { asyncHandler } from '../../shared/middleware/errorHandler';
import { authMiddleware } from '../../shared/middleware/auth';
import { zodMiddleware } from '../../shared/middleware/validate';
import { verifyBodySchema } from './auth.schema';
import { findOrCreateUser } from './auth.service';
import { env } from '../../config/env';

const router = Router();

// POST /auth/verify — NO auth middleware (this creates the session)
router.post('/verify',
  zodMiddleware(verifyBodySchema),
  asyncHandler(async (req, res) => {
    if (env.MOCK_AUTH === 'true') {
      // In mock mode, return mock user directly
      return res.json({ user: req.body, mock: true });
    }

    const decoded = await admin.auth().verifyIdToken(req.body.firebase_token);
    const user = await findOrCreateUser(
      decoded.uid,
      decoded.phone_number ?? '',
      req.body.display_name,
      req.body.device_id ?? null
    );
    res.json({ user });
  })
);

// GET /auth/me — requires auth
router.get('/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

export default router;
```

## Mock auth details

When `MOCK_AUTH=true`, the auth middleware reads `X-Mock-User` header instead of `Authorization: Bearer`.

Two predefined users:
- `X-Mock-User: landlord_marko` → Marko Petrović (landlord)
- `X-Mock-User: tenant_ana` → Ana Jovanović (tenant)

Mock user IDs are stable (`mock-landlord-001`, `mock-tenant-001`) so foreign keys work during testing.

## DO

- DO initialize Firebase Admin SDK once at startup (in app.ts or a shared init file)
- DO update display_name and device_id on every login — they may change
- DO use RETURNING * on INSERT/UPDATE to avoid a second SELECT
- DO handle the case where phone_number is null in Firebase token (e.g., email auth)

## NEVER

- NEVER apply auth middleware to POST /auth/verify — it's the bootstrap endpoint
- NEVER store Firebase tokens in the database — verify them on every request
- NEVER expose firebase_uid in API responses to the client — use our internal UUID
- NEVER hardcode mock user IDs differently in different places — use the constants from auth.ts

## Checklist

- [ ] POST /auth/verify works with both Firebase and mock modes
- [ ] GET /auth/me returns current user from auth middleware
- [ ] Mock users have stable IDs that work with foreign keys
- [ ] Firebase Admin SDK is initialized before first request
- [ ] Zod validates verify body (firebase_token, display_name required)