import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../services/auth-service.js';
import { AuthError } from '../services/auth-types.js';
import { UserRole } from '../models/user.js';
import { isUserVerified } from '../services/didit-kyc-service.js';
import { logger } from '../config/logger.js';

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

  req.user = result;
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
