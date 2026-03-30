import type { User } from '@rentsmart/contracts';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
