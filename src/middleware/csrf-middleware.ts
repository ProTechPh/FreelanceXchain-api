import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

// Configure CSRF protection with proper options
const {
  invalidCsrfTokenError,
  generateCsrfToken: csrfTokenGenerator, // Rename to avoid naming conflict
  validateRequest,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => config.jwt.secret,
  cookieName: process.env.NODE_ENV === 'production' ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token',
  cookieOptions: {
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production', // false in development
    httpOnly: true,
    domain: undefined, // Don't set domain for localhost
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req: Request) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return `${ip}-${userAgent}`;
  },
});

console.log('[CSRF INIT] CSRF protection initialized');
console.log('[CSRF INIT] csrfTokenGenerator type:', typeof csrfTokenGenerator);
console.log('[CSRF INIT] doubleCsrfProtection type:', typeof doubleCsrfProtection);

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
  '/api/auth/csrf-token', // CSRF token generation endpoint
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
 * This endpoint generates a CSRF token and sets it in a cookie
 */
export function generateCsrfToken(req: Request, res: Response): void {
  const requestId = req.headers['x-request-id'] ?? 'unknown';

  try {
    console.log('[CSRF DEBUG] csrfTokenGenerator function type:', typeof csrfTokenGenerator);
    
    if (typeof csrfTokenGenerator !== 'function') {
      throw new Error(`csrfTokenGenerator is not a function, it is: ${typeof csrfTokenGenerator}`);
    }

    // Generate the token using the library function
    const token = csrfTokenGenerator(req, res);
    const cookieName = process.env.NODE_ENV === 'production' ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token';
    
    console.log('[CSRF DEBUG] Token generated:', !!token);
    console.log('[CSRF DEBUG] Token value:', token);
    console.log('[CSRF DEBUG] Response headers after token generation:', res.getHeaders());
    
    // Also manually set the cookie to ensure it's sent
    res.cookie(cookieName, token, {
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
    });
    
    console.log('[CSRF DEBUG] Cookie manually set');
    console.log('[CSRF DEBUG] Response headers after manual cookie:', res.getHeaders());
    
    logger.info('CSRF token generated successfully', {
      requestId,
      cookieName,
      method: req.method,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      tokenGenerated: !!token,
    });
    
    res.status(200).json({
      message: 'CSRF token generated and set in cookie',
      token, // Include the token in response for debugging
      cookieName,
      timestamp: new Date().toISOString(),
      requestId,
    });
  } catch (error) {
    console.error('[CSRF DEBUG] Error in generateCsrfToken:', error);
    
    logger.error('Failed to generate CSRF token', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: {
        code: 'CSRF_TOKEN_GENERATION_FAILED',
        message: 'Failed to generate CSRF token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}
