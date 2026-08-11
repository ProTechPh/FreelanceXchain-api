import './config/load-env.js';
import express, { Express, Request, Response, NextFunction } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import cors from 'cors';
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
import { config } from './config/env.js';
import routes from './routes/index.js';
import rootRoutes from './routes/root-routes.js';

export async function createApp(): Promise<Express> {
  const app = express();

  // Trust the configured number of reverse-proxy hops so req.ip reflects the real
  // client IP (rate limiting, audit logs) behind nginx/Cloudflare/HF Spaces.
  // See TRUST_PROXY_HOPS in config/env.ts.
  app.set('trust proxy', config.server.trustProxyHops);

  // Security middleware (must be first)
  app.use(securityHeaders);
  app.use(requestIdMiddleware);
  app.use(httpsEnforcement);

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
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token', 'Cache-Control'],
    credentials: true,
  }));

  // Request logging middleware
  app.use(requestLogger);

  // CSRF protection middleware (after body parsing and logging)
  app.use(csrfProtection);

  const apiDocsEnabled = config.server.enableApiDocs;
  if (apiDocsEnabled) {
    const openApiSpecPath = resolve(process.cwd(), 'openapi.json');
    let openApiSpec: Record<string, unknown>;

    try {
      const openApiSpecRaw = await readFile(openApiSpecPath, 'utf8');
      openApiSpec = JSON.parse(openApiSpecRaw) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `Failed to load OpenAPI spec from ${openApiSpecPath}. The openapi.json file must exist before enabling API docs.`,
        { cause: error }
      );
    }

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
          "default-src 'self';script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;script-src-attr 'unsafe-inline';style-src 'self' 'unsafe-inline';img-src 'self' data: https:;font-src 'self' https:;connect-src 'self';object-src 'none';frame-src 'none';base-uri 'self';form-action 'self';frame-ancestors 'none'"
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

  // Root routes (health check, robots.txt, sitemap.xml, reset-password redirect)
  app.use('/', rootRoutes);

  // Prevent caching of API responses
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // API routes
  app.use('/api', routes);

  // Catch-all 404 handler — prevents Express finalhandler from overriding security headers
  app.use((req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendErrorResponse(res, 404, 'NOT_FOUND', 'Route not found', getRequestId(req));
  });

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
