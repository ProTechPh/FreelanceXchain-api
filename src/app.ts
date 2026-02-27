import express, { Express, Request, Response, NextFunction } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { errorHandler, requestLogger } from './middleware/index.js';
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

export async function createApp(): Promise<Express> {
  const app = express();

  // Security middleware (must be first)
  app.use(securityHeaders);
  app.use(requestIdMiddleware);
  app.use(httpsEnforcement);

  // Body parsing middleware
  app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      (req as Request).rawBody = buf.toString('utf8');
    },
  }));
  app.use(express.urlencoded({ extended: true }));

  // Cookie parsing middleware (required for CSRF protection)
  app.use(cookieParser());

  // CORS middleware with restricted origins
  const allowedOrigins = getAllowedOrigins();
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (validateCorsOrigin(origin, allowedOrigins)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token'],
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
        `Failed to load OpenAPI spec from ${openApiSpecPath}. Run \"npm run openapi:generate\" before enabling API docs.`,
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

  // Health check endpoint
  app.get('/', (_req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'FreelanceXchain API is running',
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  // API routes
  app.use('/api', routes);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
