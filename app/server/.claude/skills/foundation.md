# Skill: Foundation (shared layer)

## Context

This skill covers the shared infrastructure that ALL modules depend on: database client, middleware, utilities, types, and config. Read this skill before working on ANY module — it defines the patterns everything else builds on.

## Files in scope

```
src/shared/
├── types/index.ts          # ALL domain types
├── types/express.d.ts      # Request augmentation
├── middleware/auth.ts       # Firebase + mock auth
├── middleware/errorHandler.ts
├── middleware/validate.ts   # Zod middleware
├── db/client.ts            # pg Pool + Supabase client
├── db/migrations/001_initial.sql
└── utils/
    ├── hash.ts             # SHA-256 helpers
    ├── geo.ts              # Haversine distance
    └── errors.ts           # AppError class

src/config/env.ts           # Zod-validated env vars
src/index.ts                # Entry point
src/app.ts                  # Express app setup
```

## Dependencies

None — this is the base layer. All modules import FROM shared, shared never imports from modules.

## Pattern: db/client.ts

```typescript
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

// For ALL data queries
export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// For Storage operations ONLY (image upload/download)
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
```

## Pattern: config/env.ts

```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),

  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),

  GEMINI_API_KEY: z.string().min(1),

  SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  SOLANA_AUTHORITY_KEYPAIR: z.string().min(1).optional(),
  SOLANA_PROGRAM_ID: z.string().min(1).optional(),

  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  MOCK_AUTH: z.enum(['true', 'false']).default('false'),
  MOCK_LLM: z.enum(['true', 'false']).default('false'),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = envSchema.parse(process.env);
```

## Pattern: app.ts

```typescript
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { errorHandler } from './shared/middleware/errorHandler';

// Module routers
import authRouter from './modules/auth/auth.routes';
import contractsRouter from './modules/contracts/contracts.routes';
import inspectionsRouter from './modules/inspections/inspections.routes';
import analysisRouter from './modules/analysis/analysis.routes';
import auditRouter from './modules/audit/audit.routes';
import blockchainRouter from './modules/blockchain/blockchain.routes';

const app = express();

// Global middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Mount module routers
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/contracts', contractsRouter);
app.use('/api/v1/contracts', inspectionsRouter);   // nested under /contracts/:id/checkin/*
app.use('/api/v1/contracts', analysisRouter);       // nested under /contracts/:id/analyze
app.use('/api/v1/contracts', auditRouter);          // nested under /contracts/:id/audit
app.use('/api/v1/contracts', blockchainRouter);     // nested under /contracts/:id/blockchain

// Error handler — MUST be last
app.use(errorHandler);

export default app;
```

## Pattern: index.ts

```typescript
import app from './app';
import { env } from './config/env';

app.listen(env.PORT, () => {
  console.log(`RentSmart API running on port ${env.PORT}`);
  console.log(`Mode: ${env.NODE_ENV}`);
  console.log(`Mock auth: ${env.MOCK_AUTH}`);
  console.log(`Mock LLM: ${env.MOCK_LLM}`);
});
```

## Pattern: utils/errors.ts

```typescript
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number = 400, code: string = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }

  static notFound(message: string): AppError {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static forbidden(message: string): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, 'CONFLICT');
  }
}
```

## Pattern: utils/hash.ts

```typescript
import crypto from 'crypto';

export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256Chain(previousHash: string | null, eventData: Record<string, unknown>): string {
  return sha256(JSON.stringify({ ...eventData, previous_hash: previousHash }));
}
```

## Pattern: utils/geo.ts

```typescript
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

## Pattern: middleware/validate.ts

```typescript
import { ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function zodMiddleware(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data; // Replaces body with parsed+coerced data
    next();
  };
}
```

## DO

- DO validate ALL env vars at startup with Zod — crash early on missing config
- DO use `db.query<T>()` with explicit generic type for every query
- DO use parameterized queries ($1, $2...) — ALWAYS
- DO use AppError static methods (notFound, forbidden, conflict) for readable throws
- DO mount errorHandler as the LAST middleware in app.ts
- DO keep utils pure — no DB access, no side effects in hash.ts, geo.ts

## NEVER

- NEVER use `require()` — use `import` syntax
- NEVER use `any` — use `unknown` and type guards
- NEVER use Supabase JS client for data queries — use pg Pool
- NEVER interpolate values into SQL — use $1 params
- NEVER define types outside shared/types/index.ts
- NEVER import from a module's internal files — modules expose services, not internals
- NEVER put business logic in middleware — middleware is for cross-cutting concerns only

## BAD vs GOOD examples

```typescript
// BAD — raw require, any type, string interpolation in SQL
const pg = require('pg');
const result: any = await db.query(`SELECT * FROM contracts WHERE id = '${id}'`);

// GOOD — import, typed, parameterized
import { db } from '../../shared/db/client';
import type { Contract } from '../../shared/types';
const result = await db.query<Contract>('SELECT * FROM contracts WHERE id = $1', [id]);
```

```typescript
// BAD — type defined locally
interface MyContract { id: string; status: string; }

// GOOD — imported from shared
import type { Contract } from '../../shared/types';
```

## Checklist before committing changes to shared/

- [ ] No circular imports introduced
- [ ] All new types added to shared/types/index.ts
- [ ] New env vars added to config/env.ts Zod schema
- [ ] Error handler still mounted last in app.ts
- [ ] All middleware exports are properly typed
- [ ] db.query calls have generic type parameter