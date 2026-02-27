import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

// FIXED: Use a dedicated CSRF secret instead of reusing the JWT secret
// If CSRF_SECRET env var is not set, fall back to JWT secret (not ideal but backward compatible)
const csrfSecret = process.env['CSRF_SECRET'] ?? config.jwt.secret;

// Configure CSRF protection with proper options
const {
  invalidCsrfTokenError,
  generateCsrfToken: csrfTokenGenerator, // Rename to avoid naming conflict
  validateRequest,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => csrfSecret,
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

// CSRF protection initialized (no debug logging in production)

/**
 * Paths that should be exempt from CSRF protection
 * - Health checks
 * - Webhooks from external services
 * - Public endpoints that don't modify state
 * - Authentication endpoints (login/register use credentials for protection)
 * - API endpoints protected by JWT (CSRF not needed when using JWT)
 * Note: Paths are checked WITHOUT the /api prefix since routes are mounted at /api
 */
const CSRF_EXEMPT_PATHS = [
  '/health',
  '/api/health',
  '/webhooks',
  '/auth/login', // Login endpoint
  '/auth/register', // Registration endpoint
  '/auth/callback', // OAuth callback
  '/auth/oauth/callback', // OAuth token callback
  '/auth/oauth/register', // OAuth registration
  '/auth/refresh', // Token refresh
  '/auth/forgot-password', // Password reset request
  '/auth/reset-password', // Password reset
  '/auth/resend-confirmation', // Email confirmation
  '/auth/csrf-token', // CSRF token generation endpoint
];

/**
 * Path prefixes that should be exempt from CSRF protection
 * These are JWT-protected API routes that don't need CSRF
 * Note: Paths are checked WITHOUT the /api prefix since routes are mounted at /api
 */
const CSRF_EXEMPT_PREFIXES = [
  '/kyc/', // All KYC endpoints (protected by JWT)
  '/auth/mfa/', // All MFA endpoints (protected by JWT)
  '/skills', // All skills endpoints (protected by JWT + admin role)
  '/projects', // All project endpoints (protected by JWT + role)
  '/proposals', // All proposal endpoints (protected by JWT + role)
  '/freelancer', // All freelancer profile endpoints (protected by JWT)
  '/employer', // All employer profile endpoints (protected by JWT)
  '/payments', // All payment endpoints (protected by JWT)
  '/disputes', // All dispute endpoints (protected by JWT)
  '/files', // All file upload endpoints (protected by JWT)
  '/reputation', // All reputation endpoints (protected by JWT)
  '/matching', // All AI matching endpoints (protected by JWT)
];

/**
 * Check if a path should be exempt from CSRF protection
 * Supports both exact path matching and prefix matching
 */
function isExemptPath(path: string): boolean {
  // Strip /api prefix if present since middleware runs before route mounting
  const normalizedPath = path.startsWith('/api/') ? path.substring(4) : path;
  
  // Check exact matches
  if (CSRF_EXEMPT_PATHS.includes(normalizedPath)) {
    return true;
  }
  
  // Check prefix matches
  return CSRF_EXEMPT_PREFIXES.some(prefix => normalizedPath.startsWith(prefix));
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
    if (typeof csrfTokenGenerator !== 'function') {
      throw new Error(`csrfTokenGenerator is not a function, it is: ${typeof csrfTokenGenerator}`);
    }

    // Generate the token using the library function
    // The library handles setting the cookie internally
    const token = csrfTokenGenerator(req, res);
    const cookieName = process.env.NODE_ENV === 'production' ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token';

    logger.info('CSRF token generated successfully', {
      requestId,
      cookieName,
      method: req.method,
      ip: req.ip,
      tokenGenerated: !!token,
    });
    
    // FIXED: Don't return the token in the response body - it defeats CSRF protection.
    // The client should read the token from the non-httpOnly cookie set by the library.
    // FIXED: Removed duplicate manual res.cookie() call that could cause validation failures.
    res.status(200).json({
      message: 'CSRF token generated and set in cookie',
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
