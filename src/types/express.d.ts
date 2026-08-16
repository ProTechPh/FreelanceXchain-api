import type { UserRole } from '../models/user.js';

/** Shape of the authenticated user attached to `req.user` by authMiddleware. */
export type ValidatedUser = {
  userId: string;
  email: string;
  role: UserRole;
};

declare global {
  namespace Express {
    interface Request {
      user?: ValidatedUser;
      rawBody?: string;
    }
  }
}

export {};
