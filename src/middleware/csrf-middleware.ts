import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

const csrfSecret = process.env['CSRF_SECRET'] ?? config.jwt.secret;

const {
  _invalidCsrfTokenError,
  generateCsrfToken: csrfTokenGenerator,
  _validateRequest,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => csrfSecret,
  cookieName: process.env.NODE_ENV === 'production' ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token',
  cookieOptions: {
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
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
  '/api/webhooks',
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
  const requestId = req.headers['x-request-id'] ?? 'unknown';

  if (process.env.NODE_ENV === 'test') {
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

  doubleCsrfProtection(req, res, (err?: any) => {
    if (err) {
      logger.warn('CSRF validation failed', {
        requestId,
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: err.message,
      });

      res.status(403).json({
        error: {
          code: 'CSRF_VALIDATION_FAILED',
          message: 'Invalid or missing CSRF token',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    next();
  });
}

export function generateCsrfToken(req: Request, res: Response): void {
  const requestId = req.headers['x-request-id'] ?? 'unknown';

  try {
    if (typeof csrfTokenGenerator !== 'function') {
      throw new Error(`csrfTokenGenerator is not a function, it is: ${typeof csrfTokenGenerator}`);
    }

    const token = csrfTokenGenerator(req, res);
    const cookieName = process.env.NODE_ENV === 'production' ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token';

    logger.info('CSRF token generated successfully', {
      requestId,
      cookieName,
      method: req.method,
      ip: req.ip,
      tokenGenerated: !!token,
    });

    res.status(200).json({
      message: 'CSRF token generated and set in cookie',
      cookieName,
      timestamp: new Date().toISOString(),
      requestId,
    });
  } catch (error) {
    logger.error('Failed to generate CSRF token', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: {
        code: 'CSRF_TOKEN_GENERATION_FAILED',
        message: 'Failed to generate CSRF token',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}
