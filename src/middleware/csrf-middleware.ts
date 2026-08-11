import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { doubleCsrf } from 'csrf-csrf';
import { logger } from '../config/logger.js';
import { getCsrfSecret, getNodeEnv } from '../config/env.js';
import { getErrorMessage } from '../utils/index.js';
import { getRequestId, sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';

const csrfSecret = getCsrfSecret() ?? randomBytes(32).toString('hex');
if (!getCsrfSecret()) {
  const msg = 'CSRF_SECRET not set — generated random secret (will change on restart, set CSRF_SECRET env var for persistence)';
  if (getNodeEnv() === 'production') {
    throw new Error(msg);
  }
  logger.warn(msg);
}

/* istanbul ignore next -- production-only config */
const cookieName = getNodeEnv() === 'production' ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token';
/* istanbul ignore next */
const sameSite: 'strict' | 'lax' = getNodeEnv() === 'production' ? 'strict' : 'lax';
/* istanbul ignore next */
const secure = getNodeEnv() === 'production';

const {
  generateCsrfToken: csrfTokenGenerator,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => csrfSecret,
  cookieName,
  cookieOptions: {
    sameSite,
    path: '/',
    secure,
    httpOnly: false,
    domain: undefined,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req: Request) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return `${ip}-${userAgent}`;
  },
});

const CSRF_EXEMPT_PATHS = [
  '/health',
  '/api/health',
  '/api/webhooks', // All webhooks (verified by HMAC)
  '/api/auth/login',
  '/api/auth/login/mfa-verify',
  '/api/auth/register',
  '/api/auth/callback',
  '/api/auth/oauth/callback',
  '/api/auth/oauth/register',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/resend-confirmation',
  '/api/auth/csrf-token',
  '/api/kyc/webhook',
];

function isExemptPath(path: string): boolean {
  return CSRF_EXEMPT_PATHS.some(exemptPath => path === exemptPath || path.startsWith(exemptPath + '/'));
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const requestId = getRequestId(req);

  if (getNodeEnv() === 'test') {
    next();
    return;
  }

  if (isExemptPath(req.path)) {
    next();
    return;
  }

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  doubleCsrfProtection(req, res, (err?: unknown) => {
    if (err) {
      logger.warn('CSRF validation failed', {
        requestId,
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: getErrorMessage(err),
      });

      sendErrorResponse(res, 403, 'CSRF_VALIDATION_FAILED', 'Invalid or missing CSRF token', requestId);
      return;
    }

    next();
  });
}

export function generateCsrfToken(req: Request, res: Response): void {
  const requestId = getRequestId(req);

  try {
    if (typeof csrfTokenGenerator !== 'function') {
      throw new Error(`csrfTokenGenerator is not a function, it is: ${typeof csrfTokenGenerator}`);
    }

    const token = csrfTokenGenerator(req, res);
    const cookieName = getNodeEnv() === 'production' ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token';

    logger.info('CSRF token generated successfully', {
      requestId,
      cookieName,
      method: req.method,
      ip: req.ip,
      tokenGenerated: !!token,
    });

    sendSuccessResponse(res, 200, {
      message: 'CSRF token generated and set in cookie',
      cookieName,
    }, requestId);
  } catch (error) {
    logger.error('Failed to generate CSRF token', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    sendErrorResponse(res, 500, 'CSRF_TOKEN_GENERATION_FAILED', 'Failed to generate CSRF token', requestId);
  }
}
