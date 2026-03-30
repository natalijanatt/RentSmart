import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { type ZodSchema } from 'zod';

/**
 * Returns an Express middleware that validates req.body against the given Zod schema.
 * Passes validated (and potentially coerced) data back into req.body.
 * On failure, forwards a ZodError to next() — errorHandler converts it to a 400.
 */
export function validate(schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}
