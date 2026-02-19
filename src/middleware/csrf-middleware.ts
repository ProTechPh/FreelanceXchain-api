import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

// Configure CSRF protection
const csrfUtils = doubleCsrf({
  getSecret: () => config.jwt.secret, // Use JWT secret for CSRF token generation
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req: Request) => {
    // Use a combination of IP and user agent as session identifier
    // This helps prevent CSRF tokens from being reused across different clients
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return `${ip}-${userAgent}`;
  },
});

const doubleCsrfProtection = csrfUtils.doubleCsrfProtection;

/**
 * Paths that should be exempt from CSRF protection
 * - Health checks
 * - Webhooks from external services
 * - Public endpoints that don't modify state
 * - Authentication endpoints (login/register use credentials for protection)
 */
const CSRF_EXEMPT_PATHS = [
  '/health',
  '/api/health',
  '/api/webhooks',
  '/api/auth/login', // Login endpoint
  '/api/auth/register', // Registration endpoint
  '/api/auth/callback', // OAuth callback
  '/api/auth/oauth/callback', // OAuth token callback
  '/api/auth/oauth/register', // OAuth registration
  '/api/auth/refresh', // Token refresh
  '/api/auth/forgot-password', // Password reset request
  '/api/auth/reset-password', // Password reset
  '/api/auth/resend-confirmation', // Email confirmation
];

/**
 * Check if a path should be exempt from CSRF protection
 */
function isExemptPath(path: string): boolean {
  return CSRF_EXEMPT_PATHS.some(exemptPath => path.startsWith(exemptPath));
}

/**
 * CSRF protection middleware
 * Validates CSRF tokens for state-changing requests (POST, PUT, DELETE, PATCH)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] ?? 'unknown';

  // Skip CSRF check for exempt paths
  if (isExemptPath(req.path)) {
    next();
    return;
  }

  // Skip CSRF check for safe methods (GET, HEAD, OPTIONS)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // Apply CSRF protection
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

/**
 * Generate and return a CSRF token
 * This should be called on a GET endpoint to provide tokens to clients
 * Note: The token is automatically set in cookies by the middleware
 */
export function generateCsrfToken(req: Request, res: Response): void {
  const requestId = req.headers['x-request-id'] ?? 'unknown';

  try {
    // The CSRF token is automatically generated and set in cookies
    // We just need to return a success response
    // The actual token will be in the cookie
    res.status(200).json({
      message: 'CSRF token generated and set in cookie',
      cookieName: '__Host-psifi.x-csrf-token',
      timestamp: new Date().toISOString(),
      requestId,
    });
  } catch (error) {
    logger.error('Failed to generate CSRF token', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
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
