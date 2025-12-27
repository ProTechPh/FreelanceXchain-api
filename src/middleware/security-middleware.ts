/**
 * Security Middleware
 * Provides security headers, request ID generation, and HTTPS enforcement
 */

import { Request, Response, NextFunction } from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const helmet = require('helmet') as (options?: Parameters<typeof import('helmet').default>[0]) => ReturnType<typeof import('helmet').default>;
import { v4 as uuidv4 } from 'uuid';

/**
 * Helmet middleware for security headers
 * Configures various HTTP headers to protect against common vulnerabilities
 */
export const securityHeaders = helmet({
    // Content Security Policy
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"], // Allow inline for Swagger UI & Supabase
            scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://nfcfgxfpidfvcpkyjgih.supabase.co"], // Allow connection to Supabase
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    // Hide X-Powered-By header
    hidePoweredBy: true,
    // Prevent MIME type sniffing
    noSniff: true,
    // Enable XSS filter
    xssFilter: true,
    // HSTS - enforce HTTPS (1 year)
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
    // Referrer policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

/**
 * Request ID middleware
 * Generates a unique request ID if not provided in headers
 */
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const existingId = req.headers['x-request-id'];
    if (!existingId || typeof existingId !== 'string') {
        req.headers['x-request-id'] = uuidv4();
    }
    next();
}

/**
 * HTTPS enforcement middleware for production
 * Redirects HTTP requests to HTTPS
 */
export function httpsEnforcement(req: Request, res: Response, next: NextFunction): void {
    // Check if running in production
    if (process.env['NODE_ENV'] !== 'production') {
        next();
        return;
    }

    // Check X-Forwarded-Proto header (for reverse proxies)
    const forwardedProto = req.headers['x-forwarded-proto'];
    const isSecure = req.secure || forwardedProto === 'https';

    if (!isSecure) {
        const host = req.headers.host ?? req.hostname;
        res.redirect(301, `https://${host}${req.url}`);
        return;
    }

    next();
}

/**
 * Validate CORS origin
 * Returns true if origin is allowed, false otherwise
 */
export function validateCorsOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
    if (!origin) return false;

    for (const allowed of allowedOrigins) {
        // Support wildcard subdomains like *.example.com
        if (allowed.startsWith('*.')) {
            const domain = allowed.slice(2);
            if (origin.endsWith(domain)) return true;
        } else if (origin === allowed) {
            return true;
        }
    }

    return false;
}

/**
 * Get allowed CORS origins from environment
 */
export function getAllowedOrigins(): string[] {
    const corsOrigin = process.env['CORS_ORIGIN'];

    if (!corsOrigin) {
        // In development, allow localhost by default
        if (process.env['NODE_ENV'] !== 'production') {
            return ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];
        }
        return [];
    }

    return corsOrigin.split(',').map(o => o.trim()).filter(Boolean);
}
