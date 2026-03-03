import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../services/auth-service.js';
import { AuthError } from '../services/auth-types.js';
import { UserRole } from '../models/user.js';
import { isUserVerified } from '../services/didit-kyc-service.js';
import { logger } from '../config/logger.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

type ValidatedUser = {
  id: string; // Changed from userId to id for consistency
  userId: string; // Keep both for backward compatibility
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
 * Middleware that requires MFA (AAL2) for sensitive operations.
 * Must be used AFTER authMiddleware.
 * Checks the user's Supabase session AAL level.
 */
export async function requireMFA(req: Request, res: Response, next: NextFunction): Promise<void> {
  const requestId = req.headers['x-request-id'] ?? 'unknown';
  const authHeader = req.headers.authorization;

  if (!authHeader || !req.user) {
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

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({
      error: {
        code: 'AUTH_INVALID_FORMAT',
        message: 'Invalid authorization header',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  try {
    // Create a client with the user's token to check their AAL level
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (aalError) {
      logger.auth('Failed to check AAL level — blocking request (fail-closed)', req.user.userId, {
        requestId,
        path: req.path,
        error: aalError.message,
      });
      // Fail-closed: if we can't verify MFA status, deny access to sensitive operations
      res.status(403).json({
        error: {
          code: 'MFA_CHECK_FAILED',
          message: 'Unable to verify MFA status. Please try again.',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    // If user has MFA factors enrolled (nextLevel is aal2) but current level is only aal1,
    // they haven't completed MFA verification for this session
    if (aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
      logger.auth('MFA required but not completed', req.user.userId, {
        requestId,
        path: req.path,
        currentLevel: aalData.currentLevel,
        nextLevel: aalData.nextLevel,
      });

      res.status(403).json({
        error: {
          code: 'MFA_REQUIRED',
          message: 'Multi-factor authentication is required for this operation. Please complete MFA verification.',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }
  } catch (err) {
    // Fail-closed: if AAL check throws, deny access to sensitive operations
    logger.auth('AAL check exception — blocking request (fail-closed)', req.user?.userId, {
      requestId,
      path: req.path,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    res.status(403).json({
      error: {
        code: 'MFA_CHECK_FAILED',
        message: 'Unable to verify MFA status. Please try again.',
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
