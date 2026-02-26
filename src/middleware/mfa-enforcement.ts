import { Request, Response, NextFunction } from 'express';
import { getMFAFactors } from '../services/auth-service.js';
import { logger } from '../config/logger.js';
import { UserRole } from '../models/user.js';

// Note: Request.user type is defined in auth-middleware.ts

/**
 * Middleware to enforce MFA for admin and arbitrator roles
 * Checks if user has MFA enabled, and if not, returns a specific error
 * requiring MFA enrollment before accessing protected resources
 */
export async function enforceMFAForAdmins(req: Request, res: Response, next: NextFunction): Promise<void> {
  const requestId = req.headers['x-request-id'] ?? 'unknown';
  const user = req.user;

  if (!user) {
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

  // Only enforce MFA for admin role (arbitrator not in UserRole type)
  if (user.role !== 'admin') {
    next();
    return;
  }

  // Get access token from header
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    res.status(401).json({
      error: {
        code: 'AUTH_MISSING_TOKEN',
        message: 'Authorization token is required',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Check if user has MFA enrolled
  const factorsResult = await getMFAFactors(token);

  if ('code' in factorsResult) {
    // Error getting factors - log and allow through (fail open for now)
    logger.warn('Failed to check MFA factors for admin user', {
      userId: user.userId,
      error: factorsResult.message,
      requestId,
    });
    next();
    return;
  }

  // Check if user has at least one verified MFA factor
  const hasVerifiedMFA = factorsResult.factors && factorsResult.factors.length > 0 &&
    factorsResult.factors.some((factor: any) => factor.status === 'verified');

  if (!hasVerifiedMFA) {
    logger.authzFailure(user.userId, req.path, req.method, {
      requestId,
      reason: 'MFA_REQUIRED',
      userRole: user.role,
    });

    res.status(403).json({
      error: {
        code: 'MFA_REQUIRED',
        message: 'Multi-factor authentication is required for admin and arbitrator accounts. Please enroll MFA to continue.',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // MFA is enrolled and verified, proceed
  next();
}

/**
 * Optional MFA enforcement - warns but doesn't block
 * Useful for gradual rollout or non-critical operations
 */
export function recommendMFA(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;

  if (!user) {
    next();
    return;
  }

  // Only recommend for admin role (arbitrator not in UserRole type)
  if (user.role !== 'admin') {
    next();
    return;
  }

  // Add header to response recommending MFA enrollment
  res.setHeader('X-MFA-Recommended', 'true');
  res.setHeader('X-MFA-Enrollment-URL', '/api/auth/mfa/enroll');

  next();
}
