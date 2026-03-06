/**
 * Security Middleware
 * Provides security headers, request ID generation, and HTTPS enforcement
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

// Workaround for TypeScript/Helmet import issue in NodeNext
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const helmetMiddleware = (helmet as any).default || helmet;
import { v4 as uuidv4 } from 'uuid';

/**
 * Helmet middleware for security headers
 * Configures various HTTP headers to protect against common vulnerabilities
 */
export const securityHeaders = helmetMiddleware({
    // Content Security Policy
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", process.env['SUPABASE_URL'] || "https://nfcfgxfpidfvcpkyjgih.supabase.co"], // Allow connection to Supabase
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

    let parsedOrigin: URL;
    try {
        parsedOrigin = new URL(origin);
    } catch {
        return false;
    }

    if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
        return false;
    }

    const normalizedOrigin = parsedOrigin.origin.toLowerCase();

    for (const allowed of allowedOrigins) {
        const trimmedAllowed = allowed.trim().toLowerCase();

        // Support wildcard subdomains like *.example.com
        if (trimmedAllowed.startsWith('*.')) {
            const domain = trimmedAllowed.slice(2);
            const host = parsedOrigin.hostname.toLowerCase();

            // Must be a real subdomain boundary: foo.example.com matches, evil-example.com does not
            if (host !== domain && host.endsWith(`.${domain}`)) {
                return true;
            }
            continue;
        }

        try {
            const normalizedAllowed = new URL(trimmedAllowed).origin.toLowerCase();
            if (normalizedOrigin === normalizedAllowed) {
                return true;
            }
        } catch {
            // Ignore malformed entries in CORS_ORIGIN and continue checking others
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
            return [
                'http://localhost:3000',
                'http://localhost:3001',
                'http://localhost:5173',
                'http://localhost:5174',
                'http://127.0.0.1:3000',
                'http://127.0.0.1:5173',
            ];
        }
        return [];
    }

    return corsOrigin.split(',').map(o => o.trim()).filter(Boolean);
}
