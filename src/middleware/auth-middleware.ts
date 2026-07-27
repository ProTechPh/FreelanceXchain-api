import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../services/auth-service.js';
import { AuthError } from '../services/auth-types.js';
import { UserRole } from '../models/user.js';
import { isUserVerified } from '../services/didit-kyc-service.js';
import { logger } from '../config/logger.js';

type ValidatedUser = {
  /** @deprecated Use `userId` instead. */
  id: string;
  userId: string;
  email: string;
  role: UserRole;
};

function isTokenError(result: ValidatedUser | AuthError): result is AuthError {
  return 'code' in result;
}

declare global {
  namespace Express {
    interface Request {
      user?: ValidatedUser;
      rawBody?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const requestId = req.headers['x-request-id'] ?? 'unknown';

  if (!authHeader) {
    logger.auth('Missing authorization header', undefined, {
      requestId,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    res.status(401).json({
      error: {
        code: 'AUTH_MISSING_TOKEN',
        message: 'Authorization header is required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.auth('Invalid authorization header format', undefined, {
      requestId,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    res.status(401).json({
      error: {
        code: 'AUTH_INVALID_FORMAT',
        message: 'Authorization header must be in format: Bearer <token>',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const token = parts[1] as string;

  // MFA-pending sessions fail here: Appwrite's account.get() throws
  // 'user_more_factors_required', which validateToken already handles internally.
  const result = await validateToken(token);

  if (isTokenError(result)) {
    logger.auth(`Token validation failed: ${result.code}`, undefined, {
      requestId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      errorCode: result.code,
    });

    res.status(401).json({
      error: {
        code: result.code === 'TOKEN_EXPIRED' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_TOKEN',
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  req.user = {
    id: result.userId,
    userId: result.userId,
    email: result.email,
    role: result.role,
  };
  next();
}

/**
 * Enforces authentication for sensitive operations. Must be used AFTER authMiddleware.
 *
 * MFA is verified at Appwrite session-creation time (login flow), not per-request.
 * Any JWT issued after a successful MFA challenge is implicitly MFA-verified.
 * TODO: If per-endpoint MFA re-challenge is required, verify Appwrite session MFA scope.
 */
export async function requireAuthentication(req: Request, res: Response, next: NextFunction): Promise<void> {
  const requestId = req.headers['x-request-id'] ?? 'unknown';

  if (!req.user) {
    res.status(401).json({
      error: {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Authentication required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  next();
}


export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] ?? 'unknown';
    
    if (!req.user) {
      logger.auth('Authentication required but user not authenticated', undefined, {
        requestId,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      
      res.status(401).json({
        error: {
          code: 'AUTH_UNAUTHORIZED',
          message: 'Authentication required',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.authzFailure(req.user.userId, req.path, req.method, {
        requestId,
        userRole: req.user.role,
        requiredRoles: roles,
        ip: req.ip,
      });
      
      res.status(403).json({
        error: {
          code: 'AUTH_FORBIDDEN',
          message: 'Insufficient permissions',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    next();
  };
}

export async function requireVerifiedKyc(req: Request, res: Response, next: NextFunction): Promise<void> {
  const requestId = req.headers['x-request-id'] ?? 'unknown';

  if (!req.user) {
    res.status(401).json({
      error: {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Authentication required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (req.user.role === 'admin') {
    next();
    return;
  }

  try {
    const verified = await isUserVerified(req.user.userId);
    if (!verified) {
      logger.authzFailure(req.user.userId, req.path, req.method, {
        requestId,
        reason: 'KYC_NOT_VERIFIED',
      });

      res.status(403).json({
        error: {
          code: 'KYC_REQUIRED',
          message: 'Identity verification is required for this operation',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }
  } catch (error) {
    logger.error('Failed to verify KYC status', error as Error, {
      requestId,
      userId: req.user.userId,
    });

    res.status(500).json({
      error: {
        code: 'KYC_CHECK_FAILED',
        message: 'Failed to verify KYC status',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  next();
}
