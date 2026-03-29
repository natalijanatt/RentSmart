import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', fields: err.flatten().fieldErrors });
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  const status = err instanceof Error && 'statusCode' in err
    ? (err as { statusCode: number }).statusCode
    : 500;

  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
}

/**
 * Wraps an async route handler so rejected promises are forwarded to next().
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
