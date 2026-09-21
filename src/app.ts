import './config/load-env.js';
import express, { Express, Request, Response, NextFunction } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { sendErrorResponse, getRequestId } from './utils/response-helpers.js';
import {
  securityHeaders,
  requestIdMiddleware,
  httpsEnforcement,
  getAllowedOrigins,
  validateCorsOrigin
} from './middleware/security-middleware.js';
import { csrfProtection } from './middleware/csrf-middleware.js';
import { assertBillingConfigSafe } from './services/subscription-service.js';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import routes from './routes/index.js';
import rootRoutes from './routes/root-routes.js';

/**
 * Enable CORS with a restricted origin allowlist.
 */
function configureCors(app: Express): void {
  const allowedOrigins = getAllowedOrigins();
  app.use(cors({
    origin: (origin, callback) => {
      // No Origin header = not a cross-origin browser request; skip CORS headers
      // (non-browser clients like curl/mobile don't need them)
      if (!origin) {
        callback(null, false);
        return;
      }

      if (validateCorsOrigin(origin, allowedOrigins)) {
        callback(null, true);
      } else {
        // Reject cross-origin requests by withholding CORS headers without throwing an unhandled 500 error
        callback(null, false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token', 'Cache-Control'],
    credentials: true,
  }));
}

/**
 * Read the generated OpenAPI spec, failing loudly when it is missing.
 */
async function loadOpenApiSpec(): Promise<Record<string, unknown>> {
  const openApiSpecPath = resolve(process.cwd(), 'openapi.json');
  try {
    const openApiSpecRaw = await readFile(openApiSpecPath, 'utf8');
    return JSON.parse(openApiSpecRaw) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to load OpenAPI spec from ${openApiSpecPath}. Run "npm run openapi:generate" before enabling API docs.`,
      { cause: error }
    );
  }
}

/**
 * Mount the Swagger UI and JSON spec endpoints.
 */
function configureSwaggerDocs(app: Express, openApiSpec: Record<string, unknown>): void {
  const configuredSwaggerSpec = {
    ...openApiSpec,
    servers: [
      {
        url: config.server.baseUrl,
        description: 'Configured server',
      },
    ],
  };

  app.use('/api-docs',
    (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self';script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;script-src-attr 'unsafe-inline';style-src 'self' 'unsafe-inline';img-src 'self' data: https://cdn.jsdelivr.net;font-src 'self' data: https://cdn.jsdelivr.net;connect-src 'self';object-src 'none';frame-src 'none';base-uri 'self';form-action 'self';frame-ancestors 'none'"
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
    swaggerUi.serve,
    (req: Request, res: Response, next: NextFunction) => {
      swaggerUi.setup(configuredSwaggerSpec, {
        explorer: true,
        customSiteTitle: 'Freelance Marketplace API',
      })(req, res, next);
    }
  );

  // Swagger JSON endpoint
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(configuredSwaggerSpec);
  });
}

export async function createApp(): Promise<Express> {
  // Refuse to boot a production server that would hand Pro to every user.
  assertBillingConfigSafe();

  const app = express();

  // Trust the configured number of reverse-proxy hops so req.ip reflects the real
  // client IP (rate limiting, audit logs) behind nginx/Cloudflare/HF Spaces.
  // See TRUST_PROXY_HOPS in config/env.ts.
  app.set('trust proxy', config.server.trustProxyHops);

  // Security middleware (must be first)
  app.use(securityHeaders);
  app.use(requestIdMiddleware);
  app.use(httpsEnforcement);

  // Response compression (gzip/deflate for responses >= 1KB)
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    threshold: 1024,
  }));

  // Body parsing middleware
  // Only store rawBody for webhook paths to avoid doubling memory on every request
  const WEBHOOK_PATHS = ['/api/kyc/webhook', '/api/webhooks', '/api/inbox/webhook'];
  app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      /* istanbul ignore next -- Express always sets req.path; || url fallback is dead code */
      const reqPath = (req as Request).path || (req as Request).url;
      if (WEBHOOK_PATHS.some(p => reqPath?.startsWith(p))) {
        (req as Request).rawBody = buf.toString('utf8');
      }
    },
  }));
  app.use(express.urlencoded({ extended: true }));

  // Cookie parsing middleware (required for CSRF protection)
  app.use(cookieParser());

  // CORS middleware with restricted origins
  configureCors(app);

  // Request logging middleware
  app.use(requestLogger);

  // CSRF protection middleware (after body parsing and logging)
  app.use(csrfProtection);

  const apiDocsEnabled = config.server.enableApiDocs;
  if (apiDocsEnabled) {
    if (config.server.nodeEnv === 'production') {
      logger.warn('[SECURITY WARNING] Swagger API documentation is active in production. Ensure sensitive schema details are not unintentionally exposed.');
    }
    const openApiSpec = await loadOpenApiSpec();
    configureSwaggerDocs(app, openApiSpec);
  }

  // Root routes (health check, robots.txt, sitemap.xml, reset-password redirect)
  app.use('/', rootRoutes);

  // Cache policy: no-store on mutating requests, allow read-only routes to define caching
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  // API routes
  app.use('/api', routes);

  // Catch-all 404 handler — prevents Express finalhandler from overriding security headers
  app.use((req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendErrorResponse(res, 404, 'NOT_FOUND', 'Route not found', { requestId: getRequestId(req) });
  });

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
