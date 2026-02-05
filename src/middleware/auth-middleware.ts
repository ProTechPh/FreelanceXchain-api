import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../services/auth-service';
import { AuthError } from '../services/auth-types';
import { UserRole } from '../models/user';
import { isUserVerified } from '../services/didit-kyc-service';

type ValidatedUser = {
  userId: string;
  email: string;
  role: UserRole;
};

function isTokenError(result: ValidatedUser | AuthError): result is AuthError {
  return 'code' in result;
}

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: ValidatedUser;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: {
        code: 'AUTH_MISSING_TOKEN',
        message: 'Authorization header is required',
      },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] ?? 'unknown',
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      error: {
        code: 'AUTH_INVALID_FORMAT',
        message: 'Authorization header must be in format: Bearer <token>',
      },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] ?? 'unknown',
    });
    return;
  }

  const token = parts[1] as string;
  const result = await validateToken(token);

  if (isTokenError(result)) {
    res.status(401).json({
      error: {
        code: result.code === 'TOKEN_EXPIRED' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_TOKEN',
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] ?? 'unknown',
    });
    return;
  }

  req.user = result;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'AUTH_UNAUTHORIZED',
          message: 'Authentication required',
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] ?? 'unknown',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: 'AUTH_FORBIDDEN',
          message: 'Insufficient permissions',
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] ?? 'unknown',
      });
      return;
    }

    next();
  };
}


/**
 * Middleware to require KYC verification
 * Admin users are exempted from KYC requirement
 */
export async function requireKyc(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      error: {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Authentication required',
      },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] ?? 'unknown',
    });
    return;
  }

  // Admin users are exempted from KYC requirement
  if (req.user.role === 'admin') {
    next();
    return;
  }

  const verified = await isUserVerified(req.user.userId);
  
  if (!verified) {
    res.status(403).json({
      error: {
        code: 'KYC_REQUIRED',
        message: 'KYC verification required',
      },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] ?? 'unknown',
    });
    return;
  }

  next();
}
