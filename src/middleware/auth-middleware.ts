import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../services/auth-service.js';
import { AuthError } from '../services/auth-types.js';
import { UserRole } from '../models/user.js';
import type { ValidatedUser } from '../types/express.js';
import { isUserVerified } from '../services/didit-kyc-service.js';
import { logger } from '../config/logger.js';
import { getRequestId, sendErrorResponse } from '../utils/response-helpers.js';
import { extractTokenFromRequest } from '../utils/auth-cookie-helpers.js';

function isTokenError(result: ValidatedUser | AuthError): result is AuthError {
  return 'code' in result && !('userId' in result);
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const requestId = getRequestId(req);

  let token: string | undefined;

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      logger.auth('Invalid authorization header format', undefined, {
        requestId,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      sendErrorResponse(res, 401, 'AUTH_INVALID_FORMAT', 'Authorization header must be in format: Bearer <token>', { requestId });
      return;
    }
    token = parts[1];
  } else {
    token = extractTokenFromRequest(req);
  }

  if (!token) {
    logger.auth('Missing authorization header', undefined, {
      requestId,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    sendErrorResponse(res, 401, 'AUTH_MISSING_TOKEN', 'Authorization header is required', { requestId });
    return;
  }

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

    sendErrorResponse(res, 401, result.code === 'TOKEN_EXPIRED' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID_TOKEN', result.message, { requestId });
    return;
  }

  req.user = {
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
  const requestId = getRequestId(req);

  if (!req.user) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Authentication required', { requestId });
    return;
  }

  next();
}


export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = getRequestId(req);
    
    if (!req.user) {
      logger.auth('Authentication required but user not authenticated', undefined, {
        requestId,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Authentication required', { requestId });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.authzFailure(req.user.userId, req.path, req.method, {
        requestId,
        userRole: req.user.role,
        requiredRoles: roles,
        ip: req.ip,
      });
      
      sendErrorResponse(res, 403, 'AUTH_FORBIDDEN', 'Insufficient permissions', { requestId });
      return;
    }

    next();
  };
}

export async function requireVerifiedKyc(req: Request, res: Response, next: NextFunction): Promise<void> {
  const requestId = getRequestId(req);

  if (!req.user) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Authentication required', { requestId });
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

      sendErrorResponse(res, 403, 'KYC_REQUIRED', 'Identity verification is required for this operation', { requestId });
      return;
    }
  } catch (error) {
    logger.error('Failed to verify KYC status', error as Error, {
      requestId,
      userId: req.user.userId,
    });

    sendErrorResponse(res, 500, 'KYC_CHECK_FAILED', 'Failed to verify KYC status', { requestId });
    return;
  }

  next();
}

/**
 * Tiered KYC verification middleware:
 * Allows operations under a defined monetary threshold (e.g. micro-projects < thresholdEth)
 * to proceed with verified email/wallet alone, while requiring full Didit KYC for amounts
 * at or above the threshold.
 *
 * @param getAmount Optional extractor function to retrieve the transaction amount in ETH from the request.
 * @param thresholdEth Threshold above which full KYC verification is strictly enforced (default: 0.1 ETH / ~$300).
 */
export function requireTieredKyc(
  getAmount?: (req: Request) => number | undefined,
  thresholdEth = 0.1
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = getRequestId(req);

    if (!req.user) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Authentication required', { requestId });
      return;
    }

    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Check if the requested amount falls within the micro-transaction threshold
    if (getAmount) {
      const amount = getAmount(req);
      if (
        amount !== undefined &&
        typeof amount === 'number' &&
        Number.isFinite(amount) &&
        amount >= 0 &&
        amount < thresholdEth
      ) {
        // Micro-contract exemption: allow without blocking on full Didit KYC
        next();
        return;
      }
    }

    // Otherwise enforce full KYC verification
    await requireVerifiedKyc(req, res, next);
  };
}
