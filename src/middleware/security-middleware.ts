import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { config, getCorsOrigin, getNodeEnv } from '../config/env.js';

// NodeNext CJS/ESM interop: some bundlers wrap the default export under `.default`.
// The double cast is only to reach that optional property — never to escape type checks.
const helmetMiddleware = (helmet as unknown as { default?: typeof helmet }).default ?? helmet;
import { v4 as uuidv4 } from 'uuid';

export const securityHeaders = helmetMiddleware({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    noSniff: true,
    xssFilter: true,
    // HSTS — 1 year (helmet v8 always emits the header, so no `force` option needed)
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const existingId = req.headers['x-request-id'];
    if (!existingId || typeof existingId !== 'string') {
        req.headers['x-request-id'] = uuidv4();
    }
    next();
}

export function httpsEnforcement(req: Request, res: Response, next: NextFunction): void {
    if (getNodeEnv() !== 'production') {
        next();
        return;
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    const isSecure = req.secure || forwardedProto === 'https';

    if (!isSecure) {
        // Derive the redirect target from the configured base URL rather than the
        // attacker-controlled Host header (prevents open redirect / host-header
        // poisoning, CWE-601). Falls back to the request host only when the base
        // URL is not parseable.
        let host = req.headers.host ?? req.hostname;
        try {
            const baseHost = new URL(config.server.baseUrl).host;
            if (baseHost) host = baseHost;
        } catch {
            // Unparseable base URL — keep the request host fallback.
        }
        res.redirect(301, `https://${host}${req.url}`);
        return;
    }

    next();
}

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

        // Wildcard subdomains: *.example.com matches foo.example.com but not evil-example.com
        if (trimmedAllowed.startsWith('*.')) {
            const domain = trimmedAllowed.slice(2);
            const host = parsedOrigin.hostname.toLowerCase();

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
            // Ignore malformed CORS_ORIGIN entries
        }
    }

    return false;
}

export function getAllowedOrigins(): string[] {
    const corsOrigin = getCorsOrigin();

    if (!corsOrigin) {
        if (getNodeEnv() !== 'production') {
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

/**
 * Direct access guard middleware.
 * Prevents unauthorized or direct browser navigation access to API routes.
 */
export function directAccessGuard(req: Request, res: Response, next: NextFunction): void {
    const path = req.path || req.url;

    // 1. Whitelisted static & health routes
    if (
        path === '/' ||
        path === '/robots.txt' ||
        path === '/sitemap.xml' ||
        path === '/security.txt' ||
        path === '/.well-known/security.txt' ||
        path === '/api/health' ||
        path.startsWith('/api/health/')
    ) {
        next();
        return;
    }

    // 2. External webhooks (Stripe, Didit KYC, Opencore email inbox)
    if (
        path.startsWith('/api/webhooks') ||
        path.startsWith('/api/kyc/webhook') ||
        path.startsWith('/api/inbox/webhook')
    ) {
        next();
        return;
    }

    // 3. OAuth provider redirect flow (browser navigation is expected here)
    if (
        path.startsWith('/api/auth/callback') ||
        path.startsWith('/api/auth/oauth/')
    ) {
        next();
        return;
    }

    // 4. Swagger UI if enabled
    if (config.server.enableApiDocs && (path.startsWith('/api-docs') || path === '/openapi.json')) {
        next();
        return;
    }

    // 5. Block direct browser navigation to API endpoints
    const secFetchDest = req.headers['sec-fetch-dest'];
    const secFetchMode = req.headers['sec-fetch-mode'];
    if (secFetchDest === 'document' || secFetchMode === 'navigate') {
        res.status(403).json({
            success: false,
            code: 'DIRECT_ACCESS_BLOCKED',
            message: 'Direct browser navigation to the API is disabled. Access via the application interface.',
        });
        return;
    }

    // 6. Enforce internal secret if configured
    const internalSecret = config.server.internalApiSecret;
    if (internalSecret) {
        const incomingSecret = req.headers['x-internal-secret'];
        if (!incomingSecret || incomingSecret !== internalSecret) {
            res.status(403).json({
                success: false,
                code: 'ACCESS_DENIED',
                message: 'Direct API access forbidden. Requests must originate from the authorized application.',
            });
            return;
        }
    }

    next();
}

