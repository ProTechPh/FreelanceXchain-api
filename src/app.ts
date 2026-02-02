import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { errorHandler, requestLogger } from './middleware/index.js';
import {
  securityHeaders,
  requestIdMiddleware,
  httpsEnforcement,
  getAllowedOrigins,
  validateCorsOrigin
} from './middleware/security-middleware.js';
import { swaggerSpec } from './config/swagger.js';
import routes from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // Security middleware (must be first)
  app.use(securityHeaders);
  app.use(requestIdMiddleware);
  app.use(httpsEnforcement);

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

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
        // In production, reject unknown origins
        if (process.env['NODE_ENV'] === 'production') {
          callback(new Error('Not allowed by CORS'));
        } else {
          // In development, warn but allow
          console.warn(`CORS warning: Origin ${origin} not in allowed list`);
          callback(null, true);
        }
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true,
  }));

  // Request logging middleware
  app.use(requestLogger);

  // Swagger documentation - dynamically set server URL based on request
  app.use('/api-docs', swaggerUi.serve, (req: Request, res: Response, next: NextFunction) => {
    const protocol = req.headers['x-forwarded-proto'] ?? req.protocol;
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    const dynamicSwaggerSpec = {
      ...swaggerSpec,
      servers: [
        {
          url: `${protocol}://${host}`,
          description: 'Current server',
        },
      ],
    };
    swaggerUi.setup(dynamicSwaggerSpec, {
      explorer: true,
      customSiteTitle: 'Freelance Marketplace API',
    })(req, res, next);
  });

  // Swagger JSON endpoint
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

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
