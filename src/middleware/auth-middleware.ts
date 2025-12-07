import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../services/auth-service.js';
import { TokenPayload, AuthError } from '../services/auth-types.js';
import { UserRole } from '../models/user.js';

function isTokenError(result: TokenPayload | AuthError): result is AuthError {
  return 'code' in result;
}

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
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
  const result = validateToken(token);

  if (isTokenError(result)) {
    const statusCode = result.code === 'TOKEN_EXPIRED' ? 401 : 401;
    res.status(statusCode).json({
      error: {
        code: result.code === 'TOKEN_EXPIRED' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_TOKEN',
        message: result.message,
      },
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] ?? 'unknown',
    });
    return;
  }


  // Check if it's an access token (not refresh token)
  if (result.type !== 'access') {
    res.status(401).json({
      error: {
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid token type',
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
